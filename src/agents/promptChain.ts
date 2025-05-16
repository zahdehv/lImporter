import { Chat, Part, Type } from "@google/genai";
import AutoFilePlugin from "src/main";
import { simpleQueryVault, writeFileMD} from "src/utils/files";
import { gem_extract_prompt, gem_write_prompt } from "./promp";

export const createPromptChainItems = (plugin: AutoFilePlugin,  chat: Chat, signal: AbortSignal) => {
    const extract = async (prepnd: (string | Part)[] = [], appnd: (string | Part)[] = []) => {
        const data = await chat.sendMessage({message: prepnd.concat([gem_extract_prompt]).concat(appnd), 
            config: {
                abortSignal: signal,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    required: ["instructions", "claims", "concepts", "queries"],
                    properties: {
                        instructions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING,
                        },
                        },
                        claims: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING,
                        },
                        },
                        concepts: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING,
                        },
                        },
                        queries: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING,
                        },
                        },
                    },
                    },                            
            }});
        if (!data.text) throw new Error("Error extracting data");
        console.log("### extracted data:\n\n```json\n"+data.text+"\n```");
        return JSON.parse(data.text);
    }

    const query = async (queries: string[]) => {
            const results: string[]= [];
            for (let index = 0; index < queries.length; index++) {
                const query = queries[index];
                results.push(await simpleQueryVault(plugin.app, query));
            }
            const fileContents = results.join("\n");
            return fileContents;
    }

    const write = async (prepnd: (string | Part)[] = [], appnd: (string | Part)[] = []) => {
        const r_write = await chat.sendMessage({message: prepnd.concat([gem_write_prompt]).concat(appnd), 
            config: {abortSignal: signal,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  required: ["write_files"],
                  properties: {
                    write_files: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        required: ["path", "content"],
                        properties: {
                          path: {
                            type: Type.STRING,
                          },
                          content: {
                            type: Type.STRING,
                          },
                        },
                      },
                    },
                  },
                },
                                
                }});

                if (!r_write.text) throw new Error("Error writing files");
                  const write_files = JSON.parse(r_write.text).write_files;
                  for (const write of write_files) {
                      const wrote = await writeFileMD(plugin.app, write.path, write.content);
                      if (wrote) console.log(`# File wrote [[${write.path}]]
${wrote}`);
                  plugin.tracker.appendFile(write.path);
        }
        return JSON.parse(r_write.text);
    }
    return {extract, query, write}

}