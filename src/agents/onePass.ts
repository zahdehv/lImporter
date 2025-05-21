import { createPartFromFunctionResponse, FunctionCall, FunctionResponse, Part, Tool, Type } from "@google/genai";
import { App } from "obsidian";
import { listFilesTree, simpleQueryVault, writeFileMD } from "src/utils/files";

export const toolsOnePass: Tool[] = [
    {
        functionDeclarations: [
            {
              name: 'write',
              description: 'write a FILE',
              parameters: {
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
            {
              name: 'query',
              description: 'query the files with a fuzzy search',
              parameters: {
                type: Type.OBJECT,
                required: ["pattern"],
                properties: {
                  pattern: {
                    type: Type.STRING,
                  },
                },
              },
            },
            {
              name: 'tree',
              description: 'List the directory tree of files',
              parameters: {
                type: Type.OBJECT,
                required: ["root"],
                properties: {
                  root: {
                    type: Type.STRING,
                  },
                },
              },
            },
          ],    
    }
]

const FORMAT = (icon: string, header: string, content: string) => {
    const newContent = (content.split('\n')).map((value)=> "> " + value).join("\n");
    return `> [!${icon}]${header}
${newContent}`
}

export const createFunctionHandler = (app: App, displayer: (text: string, sender: "User" | "AI") => void) => {
    const write = async (args: {path: string, content: string}) => {
        console.log("write", args.path);
        const text = await writeFileMD(app, args.path, args.content);
        if (text) {
            displayer(FORMAT("note","- `"+args.path+"`", text), "AI");
            return text;
        }
        displayer(FORMAT("fail", "Error writing "+args.path, "ERROR"),"AI")
        return "Error writing file "+args.path;
    }
    
    const query = async (args: {pattern: string}) => {
        displayer(FORMAT("question", "- QUERY: "+args.pattern, ""),"AI");
        const result = await simpleQueryVault(app, args.pattern);
        result.results.forEach(res => {
            displayer(FORMAT("tldr", "- query result: "+res.path, res.content),"AI");
        });
        displayer(FORMAT("question", "- query end: "+args.pattern, "QUERY ENDED"),"AI");
        return result.response;
    }
    
    const tree = async (args: {root: string}) => {
        const tree = await listFilesTree(app, args.root, 7, true, true, 23);
        displayer(FORMAT("tldr", "- listed tree for: "+args.root, tree),"AI");
        return tree;
    }

    const functions: Record<string, (args: any) => Promise<any>> = {
        write: write,
        query: query,
        tree: tree,
    }

    const FunctionHandler = async (functionCalls: FunctionCall[]) => {
        console.log(functionCalls);
        const answers: Part[] = [];
        for (let index = 0; index < functionCalls.length; index++) {
            const functionCall = functionCalls[index];
            if (functionCall.name)
                {
                    console.log(functionCall.name);
                    const fx = functions[functionCall.name] as any
                    if (fx) {
                        console.log("XXX",functionCall.args);
                        const result: string = await fx(functionCall.args);
                        // answers.push(createPartFromFunctionResponse(functionCall.id,functionCall.name,{response: result}));
                    }
                }
        }
        return answers;
    }
    return FunctionHandler;
}
