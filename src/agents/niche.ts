import { ContentListUnion, GenerationConfig, GoogleGenAI, PartUnion, Type } from "@google/genai";
import { models } from "./agen";
import { TFile } from "obsidian";
import lImporterPlugin from "src/main";
import { generateContentEKstream, handleStream } from "./looper";

// interface PLANres {
//     claims_present_on_files: string[];
//     instructions_on_input: string[];
//     plan: string;
// }

// export async function generate_plan(plugin: lImporterPlugin, files: PartUnion[], autoAccept: boolean = false) {
//     const planstep = plugin.tracker.appendStep("Generating plan", "Generating plan", "text", 'in-progress');
//     const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
//     const contents = files.concat({ text: "Given the files, devise a plan to create notes about the content, extracting the claims that appear on the files. If there appear any instruction, extract it too." });
//     const config = {
//         temperature: 0.55,
//         responseMimeType: 'application/json',
//         responseSchema: {
//             type: Type.OBJECT,
//             required: ["claims_present_on_files", "plan"],
//             properties: {
//                 claims_present_on_files: {
//                     type: Type.ARRAY,
//                     items: {
//                         type: Type.STRING,
//                     },
//                 },
//                 instructions_on_input: {
//                     type: Type.ARRAY,
//                     items: {
//                         type: Type.STRING,
//                     },
//                 },
//                 plan: {
//                     type: Type.STRING,
//                 },
//             },
//         },
//     };
//     const response = await generateContentEK(ai.models.generateContent, { model: models.flash25, contents, config });
//     if (response.text) {
//         const ob: PLANres = JSON.parse(response.text);
//         planstep.updateState('complete', "Plan generated!");
//         return ob;
//     } else throw new Error("No response");

// }

// export async function CPRS(plugin: lImporterPlugin, query_keypoints: string[], batch_amount = 5) {
//     const claim_options = query_keypoints.map(item => "The claim '" + item + "' is already present in at least one of the files in the vault:")
//     const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
//     const files = plugin.app.vault.getMarkdownFiles().filter(file => !file.name.includes(".lim")); // Consider using all files

//     const batch_size = Math.ceil(files.length / batch_amount)
//     let processed = 0;
//     const retr_stp = plugin.tracker.appendStep(`Retrieving contents from ${batch_amount} batches with size ${batch_size}`, `Processed: (0/${batch_amount})`, 'file-search', 'in-progress');

//     const path_to_link: Record<string, string> = {}
//     // const path_to_file: Record<string, TFile> = {}

//     files.forEach(file => {
//         // path_to_file[file.path] = file;
//         path_to_link[file.path] = plugin.app.fileManager
//             .generateMarkdownLink(
//                 file,
//                 "/",
//                 undefined,
//                 "{you can set an optional display text here}");
//     });


//     // here goes the batch function...
//     const processBATCH = async (batch_files: TFile[], no: number) => {
//         const path_options = batch_files.map(file => file.path);
//         const context_list = [];
//         for (let index = 0; index < batch_files.length; index++) {
//             const b_file = batch_files[index];
//             const b_file_content = await plugin.app.vault.cachedRead(b_file);
//             context_list.push(`<file path='${b_file.path}'>\n${b_file_content}\n</file>`)
//         }
//         const context_files = context_list.join("\n\n");
//         const config: GenerationConfig = {
//             temperature: 0.55,
//             responseMimeType: 'application/json',
//             responseSchema: {
//                 type: Type.OBJECT,
//                 required: ["retrieved_items"],
//                 properties: {
//                     retrieved_items: {
//                         type: Type.ARRAY,
//                         items: {
//                             type: Type.OBJECT,
//                             required: ["claim", "paths", "summary"],
//                             properties: {
//                                 claim: {
//                                     type: Type.STRING,
//                                     enum: claim_options,
//                                 },
//                                 paths: {
//                                     type: Type.ARRAY,
//                                     items: {
//                                         type: Type.STRING,
//                                         enum: path_options,
//                                     },
//                                 },
//                                 summary: {
//                                     type: Type.STRING,
//                                 },
//                             },
//                         },
//                     },
//                 },
//             },
//         };

//         const contents = [
//             {
//                 role: 'user',
//                 parts: [
//                     {
//                         text: context_files + "\n\nPlease extract those files that contain content related to a greater than zero amount of the provided keypoints: \n" + query_keypoints.map(i => "- " + i).join("\n") + " and sumarize why is the content of those files relevant.",
//                     },
//                 ],
//             },
//         ];
//         const response = await generateContentEK(ai.models.generateContent, {
//             model: models.flash25,
//             config,
//             contents,
//         });
//         if (response.text) {
//             const ob: {
//                 retrieved_items: {
//                     claim: string;
//                     paths: string[];
//                     summary: string;
//                 }[]
//             } = JSON.parse(response.text);
//             const answer_parts: string[] = [];
//             ob.retrieved_items.forEach(item => {
//                 const retrieved = item.claim + ":\n" + item.paths.map(pth => "- " + pth).join("\n") + "\nSummary: '" + item.summary + "'";
//                 // `The file '${item.path}'(link to this note using '${path_to_link[item.path]}') contains the following keypoints:\n${keypoints}\nSummary: ${item.summary}`;
//                 answer_parts.push(retrieved);
//                 item.paths.forEach((pth) => {
//                     retr_stp.appendFile(plugin, pth, retrieved);
//                 })
//             });
//             processed += 1;
//             //////
//             retr_stp.updateCaption(`Processed: (${processed}/${batch_amount})`);
//             return answer_parts.join("\n\n");
//         } else throw new Error("Failed getting related content");
//     }


//     // here goes the for
//     const batches: Promise<string>[] = [];
//     for (let s = 0; s < files.length; s += batch_size) {
//         const elements = files.slice(s, s + batch_size);
//         batches.push(processBATCH(elements, (s + batch_size) / batch_size));
//     }
//     const result = (await Promise.all(batches)).join("\n");

//     retr_stp.updateState('complete');
//     return result;
// }

function getConf(path_options: string[]): GenerationConfig {
    return {
        temperature: 0.55,
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            required: ["retrieved_items"],
            properties: {
                retrieved_items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        required: ["claim", "paths", "summary"],
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
    };
}

export async function CPRS(plugin: lImporterPlugin, question: string, files: TFile[], max_tokens = 131072): Promise<{ extracted_item: string; path: string }[]> {
    const ai = new GoogleGenAI({ apiKey: plugin.settings.GOOGLE_API_KEY });
    const context_list = [];
    for (let index = 0; index < files.length; index++) {
        const b_file = files[index];
        const b_file_content = await plugin.app.vault.cachedRead(b_file);
        context_list.push(`<file path='${b_file.path}'>\n${b_file_content}\n</file>`)
    }

    const text = context_list.join("\n\n");
    const tokens = await ai.models.countTokens({ model: models.flash2, contents: text });

    if (tokens.totalTokens && tokens.totalTokens <= max_tokens) {
        //process the tokens and return
        const path_options = files.map(file => file.path);
        const config = getConf(path_options);
        const contents: PartUnion[] = [
            { text: "" }
        ];

        const response = await generateContentEKstream(ai.models.generateContentStream, {
            model: models.flash25,
            config,
            contents,
        });

        const { fullText } = await handleStream(plugin, response, []);
        return JSON.parse(fullText);

    } else {
        //split in half and call recursively
        const hf = Math.ceil(files.length / 2);
        const filesI = files.slice(undefined, hf);
        const filesII = files.slice(hf);
        return (await CPRS(plugin, question, filesI)).concat(await CPRS(plugin, question, filesII));
    }
}