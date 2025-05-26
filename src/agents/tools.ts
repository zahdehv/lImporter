import { Type } from "@google/genai";
import { FORMAT_CALLOUT, FunctionArg } from "./looper";
import { listFilesTree, simpleQueryVault, writeFileMD } from "src/utils/files";
import { write_content, write_description, write_path } from "./promp";

export const writeFX: FunctionArg = {
    run: async (plugin, args: {path: string, content: string}) => {
        console.log("write", args.path);
        const text = await writeFileMD(plugin.app, args.path, args.content);
        if (text) {
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("info", '-', "write "+args.path, text.newContent));
            return {output: text.newContent};
        }
        return {output: "Error writing file "+args.path};
    },
    schema: 
    {
        name: 'write',
        description: write_description +"\n\n"+ write_path +"\n\n"+ write_content,
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
    }
}

export const queryFX: FunctionArg = {
    run: async (plugin, args: {pattern: string}) => {
        plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("question", '-', "QUERY "+args.pattern));
        const result = await simpleQueryVault(plugin.app, args.pattern);
        result.results.forEach(res => {
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("tldr", '-', "query result "+res.path, res.content));
        });
        plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("question", '-', "query end "+args.pattern));
        return {output: result.response};
    },
    schema: 
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
    }
}

export const treeFX: FunctionArg = {
    run: async (plugin, args: {root: string}) => {
        const tree = await listFilesTree(plugin.app, args.root, 7, true, true, 23);
        plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("tldr", '-', "listed tree for: "+args.root));
        
        return {output: tree};
    },
    schema: 
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
    }
}