import { Type } from "@google/genai";
import { FORMAT_CALLOUT, FunctionArg } from "./looper";
import { treeHELPER, queryHELPER, writeHELPER, moveHELPER } from "src/utils/files";
import { list_files_description, list_files_root, move_file_description, move_file_destination, move_file_source, query_desc, query_pattern, getWriteSpecs, write_description, write_path } from "./promp";
import { App } from "obsidian";
import lImporterPlugin from "src/main";

export async function getFunctions(app: App) {
    const write_specs = await getWriteSpecs(app);
    const writeFX: FunctionArg = {
        run: async (plugin, args: { path: string, content: string }) => {
            console.log("write", args.path);
            const wrote = await writeHELPER(plugin.app, args.path, args.content);
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("info", '-', "write " + args.path, "```diff\n" + wrote.diff + "\n```"));
            return { output: wrote.message };
        },
        schema:
        {
            name: 'write',
            description: write_description,
            parameters: {
                type: Type.OBJECT,
                required: ["path", "content"],
                properties: {
                    path: {
                        type: Type.STRING,
                        description: write_path,
                    },
                    content: {
                        type: Type.STRING,
                        description: write_specs,
                    },
                },
            },
        }
    }

    const moveFX: FunctionArg = {
        run: async (plugin, args: { source: string, target: string }) => {
            const text = await moveHELPER(plugin.app, args.source, args.target);
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("info", '-', "move " + args.source + " to " + args.target));
            return { output: text };
        },
        schema:
        {
            name: 'move',
            description: move_file_description,
            parameters: {
                type: Type.OBJECT,
                required: ["source", "target"],
                properties: {
                    source: {
                        type: Type.STRING,
                        description: move_file_source,
                    },
                    target: {
                        type: Type.STRING,
                        description: move_file_destination,
                    },
                },
            },
        }
    }
    
    const queryFX: FunctionArg = {
        run: async (plugin, args: { pattern: string }) => {
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("question", '-', "QUERY " + args.pattern));
            const result = await queryHELPER(plugin.app, args.pattern);
            result.results.forEach(res => {
                plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("tldr", '-', "query result " + res.path, res.content));
            });
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("question", '-', "query end " + args.pattern));
            return { output: result.response };
        },
        schema:
        {
            name: 'query',
            description: query_desc,
            parameters: {
                type: Type.OBJECT,
                required: ["pattern"],
                properties: {
                    pattern: {
                        type: Type.STRING,
                        description: query_pattern,
                    },
                },
            },
        }
    }
    
    const treeFX: FunctionArg = {
        run: async (plugin, args: { root: string }) => {
            const tree = await treeHELPER(plugin.app, args.root, 7, true, true, 23);
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("tldr", '-', "listed tree for: " + args.root));
    
            return { output: tree };
        },
        schema:
        {
            name: 'tree',
            description: list_files_description,
            parameters: {
                type: Type.OBJECT,
                required: ["root"],
                properties: {
                    root: {
                        type: Type.STRING,
                        description: list_files_root,
                    },
                },
            },
        }
    }

    return {writeFX, moveFX, queryFX, treeFX}
}
