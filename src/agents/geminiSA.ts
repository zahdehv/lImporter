import { GoogleGenAI, Part, Type } from "@google/genai";
import { FileItem } from "../utils/fileUploader";
import { processTracker } from "../utils/tracker";
import { MarkdownRenderer } from "obsidian";
// READ(embed with cornell idea) -> CREATE -> CHECK
export class KsAgent {
    private ai: GoogleGenAI;
    private tracker: processTracker;
    constructor(apiKey: string, tracker: processTracker) {
        this.ai = new GoogleGenAI({apiKey: apiKey});
        this.tracker = tracker;
    }

    async request(prompt: string, files: FileItem[]) {
        const msg: (Part|string)[] = []
        for (let index = 0; index < files.length; index++) {
            const element = files[index];
            const file = await this.ai.files.upload({file: element.blob});
            element.uploaded = true;
            msg.push({fileData: {fileUri: file.uri, mimeType: file.mimeType}});
        }
        
        msg.push(prompt);
        const tools = [
            {
              functionDeclarations: [
                {
                  name: 'write',
                  description: 'write a .md file',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      content: {
                        type: Type.STRING,
                      },
                      path: {
                        type: Type.STRING,
                      },
                    },
                  },
                },
              ],
            }
          ];
        const chat = this.ai.chats.create({model: "gemini-2.5-flash-preview-04-17", config: {thinkingConfig: {includeThoughts: true}, tools: tools}});
        let step = this.tracker.appendStep("LLM", "Thinking", "bot");
        const response = await chat.sendMessageStream({message: msg, config: {}});
        //       for await (const chunk of response) {
            //         text+=chunk.text;
            //         tex.updateCaption(text);
            // }
        step.updateState('complete');
        let fullText = '';
        for await (const chunk of response) {
            if (chunk.functionCalls) {
                fullText = '';
                chunk.functionCalls.forEach(element => {
                    if (element.name) {
                        step.updateState('pending');
                        step = this.tracker.appendStep("Tool", element.name, 'wrench');
                        step.updateState('pending');
                    }
                });
            } else {if (fullText === '') {
                // step.updateState('pending');
                step = this.tracker.appendStep("LLM", '', 'bot');
                fullText+=chunk.text;
            } else {
                fullText += chunk.text;
                console.log(fullText);
                step.updateCaption(fullText);
            }}
        }
}
}