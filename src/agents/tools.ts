import { GenerateContentConfig, GenerationConfig, GoogleGenAI, PartUnion, Type } from "@google/genai";
import { FORMAT_CALLOUT, FunctionArg, generateContentEKstream, handleStream } from "./looper";
import { treeHELPER, writeHELPER, moveHELPER } from "src/utils/files";
import { prompts, getSpecs } from "./promp";
import { App, normalizePath, TFile } from "obsidian";
import { models } from "./agen";
import lImporterPlugin from "src/main";
import { askModal } from "../views/confirm";

export async function getFunctions(app: App, cf = { askPlan: true, askWrite: false }) {
    const { askPlan } = cf;
    const write_specs = await getSpecs(app, 'write');
    const folder_options = app.vault.getAllFolders(true).map(folder => folder.path);
    const file_options = app.vault.getFiles().map(file => file.path);
    const md_options = app.vault.getMarkdownFiles().map(file => file.path);

    const mkdirFX: FunctionArg = {
        run: async (plugin, args: { path: string }) => {
            // const w = plugin.tracker.appendStep("Write file", "writing file...", "pen", 'in-progress');
            // plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("info", '-', "write " + args.path, "```diff\n" + wrote.diff + "\n```"));
            // w.updateState("complete");
            // w.appendFile(plugin, args.path, "\n\n```diff\n" + wrote.diff + "\n```");
            const md = plugin.tracker.createMessage("AI");

            await app.vault.adapter.mkdir(normalizePath(args.path));
            md.MD(FORMAT_CALLOUT("note", '+', `mkdir \`${args.path}\``));
            return { output: "Folder created" };
        },
        schema:
        {
            name: 'create_directory',
            description: prompts.write_description,
            parameters: {
                type: Type.OBJECT,
                required: ["path"],
                properties: {
                    path: {
                        type: Type.STRING,
                        description: prompts.write_folderpath,
                    },
                },
            },
        }
    }

    const writeFX: FunctionArg = {
        run: async (plugin, args: { folder_path: string, filename: string, content: string }) => {
            // const w = plugin.tracker.appendStep("Write file", "writing file...", "pen", 'in-progress');
            // plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("info", '-', "write " + args.path, "```diff\n" + wrote.diff + "\n```"));
            // w.updateState("complete");
            // w.appendFile(plugin, args.path, "\n\n```diff\n" + wrote.diff + "\n```");
            const path = args.folder_path.split('/').concat([args.filename]).filter(pt=>pt != '').join('/');
            const wt = plugin.tracker.createMessage("AI");
            wt.MD(FORMAT_CALLOUT("note", '+', `writing \`${path}\``, `${args.content}`));
            const wrote = await writeHELPER(plugin.app, path, args.content);
            wt.MD(FORMAT_CALLOUT("check", '-', `\`${path}\` wrote`, `\`\`\`diff\n${wrote.diff}\n\`\`\``));
            return { output: wrote.message };
        },
        schema:
        {
            name: 'write',
            description: prompts.write_description,
            parameters: {
                type: Type.OBJECT,
                required: ["folder_path", "filename", "content"],
                properties: {
                    folder_path: {
                        type: Type.STRING,
                        description: prompts.write_folderpath,
                        enum: folder_options
                    },
                    filename: {
                        type: Type.STRING,
                        description: prompts.write_filename,
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
            description: prompts.move_file_description,
            parameters: {
                type: Type.OBJECT,
                required: ["source", "target"],
                properties: {
                    source: {
                        type: Type.STRING,
                        description: prompts.move_file_source,
                        enum: file_options
                    },
                    target: {
                        type: Type.STRING,
                        description: prompts.move_file_destination,
                    },
                },
            },
        }
    }

    const readFX: FunctionArg = {
        run: async (plugin, args: { filename: string }) => {

            const file = app.vault.getFileByPath(args.filename);
            if (file) {
                const content = await app.vault.cachedRead(file);
                plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("tldr", '-', `read file \`${args.filename}\``, content));
                return { output: content };
            }
            return { output: "Error reading file" };
        },
        schema:
        {
            name: 'open_file',
            description: prompts.openfile_desc,
            parameters: {
                type: Type.OBJECT,
                required: ["filename"],
                properties: {
                    filename: {
                        type: Type.STRING,
                        description: prompts.openfilepath,
                        enum: md_options
                    },
                },
            },
        }
    }

    const treeFX: FunctionArg = {
        run: async (plugin, args: { root: string, include_files: boolean }) => {
            const tree = await treeHELPER(plugin.app, args.root, 7, args.include_files, true, 23);
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("tldr", '-', "listed tree for: " + args.root, `\`\`\`json\n${tree}\n\`\`\``));

            return { output: tree };
        },
        schema:
        {
            name: 'tree',
            description: prompts.list_files_description,
            parameters: {
                type: Type.OBJECT,
                required: ["root", "include_files"],
                properties: {
                    root: {
                        type: Type.STRING,
                        description: prompts.list_files_root,
                        enum: folder_options
                    },
                    include_files: {
                        type: Type.BOOLEAN,
                        description: prompts.list_files_include_files,
                    },
                },
            },
        }
    }

    const finishFX: FunctionArg = {
        run: async (plugin, args: { reason: string }) => {
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("info", '-', "Session ended by model", `REASON: ${args.reason}`));
            return { output: "ENDED SESSION" };
        },
        schema:
        {
            name: 'end_session',
            description: prompts.end_session,
            parameters: {
                type: Type.OBJECT,
                required: ["reason"],
                properties: {
                    reason: {
                        type: Type.STRING,
                        description: prompts.end_reason,
                    },
                },
            },
        }
    }

    const planFX: FunctionArg = {
        run: async (plugin, args: { plan: string }) => {
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("info", '-', "The model proposed a plan", `PLAN:\n${args.plan}`));
            if (askPlan) {
                const { accepted, feedback } = await askModal(plugin, 'accept plan?', args.plan);
                if (accepted) {
                    plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("check", '-', "plan accepted", `PLAN:\n${args.plan}`));
                    return { output: "The user accepted the plan.", metadata: { accepted: true } };
                }
                plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("fail", '-', "plan rejected", `FEEDBACK:\n${feedback}`));
                return { output: `The user rejected the plan and gave feedback: '${feedback}'.`, metadata: { accepted: true } };

            } else {
                plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("check", '-', "plan accepted", `PLAN:\n${args.plan}`));
                return { output: "The user accepted the plan.", metadata: { accepted: true } };
            }
        },
        schema:
        {
            name: 'propose_plan',
            description: prompts.plan,
            parameters: {
                type: Type.OBJECT,
                required: ["plan"],
                properties: {
                    plan: {
                        type: Type.STRING,
                        description: prompts.plan_desc,
                    },
                },
            },
        }
    }

    const askFilesFX: FunctionArg = {
        run: async (plugin, args: { question: string, level: 'paragraph' | 'sentence' | 'keyword' }) => {
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("info", '+', `The model asked a question at \`${args.level}\` level`, `QUESTION: ${args.question}`));
            const relevant_items = await CPRS_TL(plugin, args.question, args.level);
            const relevant_context: string = relevant_items?.map((item) => {
                const file = plugin.app.vault.getFileByPath(item.path);
                if (file) return `Cite ${plugin.app.fileManager.generateMarkdownLink(file, "")} to use the following information: '${item.extracted_item}'.`;
                console.debug("FILE NOT FOUND WATS HAPENINN?");
                return `File '${item.path}' not found.`;
            }).join("\n\n");
            plugin.tracker.createMessage("AI").MD(FORMAT_CALLOUT("check", '-', `\`${args.question}\``, relevant_context));
            return { output: relevant_context }
        },
        schema:
        {
            name: 'ask_files',
            description: prompts.ask_files_desc,
            parameters: {
                type: Type.OBJECT,
                required: ["question", "level"],
                properties: {
                    question: {
                        type: Type.STRING,
                        description: prompts.ask_files_question,
                    },
                    level: {
                        type: Type.STRING,
                        description: prompts.ask_files_level,
                        enum: ['paragraph', 'sentence', 'keyword'],
                    },
                },
            },
        }
    }

    return { writeFX, moveFX, readFX, treeFX, finishFX, planFX, askFilesFX, mkdirFX };
}

function getConf(plugin: lImporterPlugin, path_options: string[]): GenerateContentConfig {
    return {
        temperature: 0.55,
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            required: ["extracted_list"],
            properties: {
                extracted_list: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        required: ["extracted_item", "path"],
                        properties: {
                            extracted_item: {
                                type: Type.STRING,
                            },
                            path: {
                                type: Type.STRING,
                                enum: path_options,
                            },
                        },
                    },
                },
            },
        },
        abortSignal: plugin.tracker.abortController.signal
    };
}

export async function CPRS(plugin: lImporterPlugin, files: TFile[], prompt: string, cf = { max_tokens: 131072 }): Promise<{ extracted_item: string; path: string }[]> {
    const { max_tokens } = cf;
    const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
    const context_list: PartUnion[] = [];
    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const file_content = await plugin.app.vault.cachedRead(file);
        context_list.push(`<|FILE '${file.path}' START|>\n${file_content}\n<|FILE '${file.path}' END|>`)
    }

    const tokens = await ai.models.countTokens({ model: models.flash2, contents: context_list });

    if (tokens.totalTokens && tokens.totalTokens <= max_tokens) {
        //process the tokens and return
        const path_options = files.map(file => file.path);
        const config = getConf(plugin, path_options);
        const contents: PartUnion[] = context_list.concat(prompt);

        const response = await generateContentEKstream(ai.models.generateContentStream, {
            model: models.flash25,
            config: config,
            contents,
        });

        const { fullText } = await handleStream(plugin, response, [], { preff: "```json\n", suff: "\n```" });
        return JSON.parse(fullText).extracted_list;

    } else {
        //split in half and call recursively
        const hf = Math.ceil(files.length / 2);
        const filesI = files.slice(undefined, hf);
        const filesII = files.slice(hf);
        return (await CPRS(plugin, filesI, prompt)).concat(await CPRS(plugin, filesII, prompt));
    }
}

export async function CPRS_TL(plugin: lImporterPlugin, question: string, level: "keyword" | "paragraph" | "sentence", max_tokens = 131072) {
    const files = plugin.app.vault.getMarkdownFiles().filter(file=>(!file.name.includes('.lim')));
    switch (level) {
        case "keyword":
            const prompt_keywords = prompts.extract_keywords + question + prompts.extract_suffix;
            return CPRS(plugin, files, prompt_keywords, { max_tokens });
        case "paragraph":
            const prompt_paragraph = prompts.extract_paragraph + question + prompts.extract_suffix;
            return CPRS(plugin, files, prompt_paragraph, { max_tokens });
        case "sentence":
            const prompt_sentence = prompts.extract_sentence + question + prompts.extract_suffix;
            return CPRS(plugin, files, prompt_sentence, { max_tokens });
        default:
            const prompt_default = prompts.extract_sentence + question + prompts.extract_suffix;
            return CPRS(plugin, files, prompt_default, { max_tokens });
    }
}