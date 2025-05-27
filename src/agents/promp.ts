import { App, TFile } from "obsidian";

export const react_system_prompt = `You are a helpful NoteWriter, when you have files you capture esential keypoints among them and
write them on the respective files, first checking they do not already exist, and providing high quality condensed content to the
vault.`
export const react_starter_prompt = `Given the files you have to process, you must create notes on Obsidian in the correct .md format.`;


// TOOLS
export const write_description = `Used to create markdown (.md) files.`;
export const write_path = `Path to create or modify the file.
Example file names (path): 'cuban_art.md' or 'love/romance.md'.
Do not use accents in the title. If you use an existing file name, you will modify it;
use it to correct errors if necessary.
File name cannot contain any of the following characters: * " \ / < > : | ?`; // This line was already in English
export const write_content = `Content to be written to the file.

Specifications for writing content:
1. Files must start with the header:
---
tags: 
- FirstTag (tags represent the concepts (conceptual entities) that appear in the document | tags must not have spaces)
- SecondTag (tags represent the concepts (conceptual entities) that appear in the document | tags must not have spaces)
---
2. Links are of the form [[filename(no need to include the full path)|Name displayed in the Note]]
3. You can use all available Markdown language resources.
4. Tags can also be included in the text, using the '#tagName' form (check there are no spaces after the '#')`;
export async function getWriteSpecs(app: App) {
    const files: TFile[] = app.vault.getFiles();
    if (!(files.length>0)) return write_content;
    const filtered = files.filter(val => (val.name.startsWith('write') && val.name.includes('.lim')));
    const res: string[] = [];
    for (let index = 0; index < filtered.length; index++) {
        const file = filtered[index];
        const content = await app.vault.cachedRead(file);
        res.push(content);
    }
    return write_content + "\n User has also included preferences about the files content:\n" + res.join("\n");
}
// nombre.startsWith('write') && nombre.includes('.lim')

export const move_file_description = "Moves a file from one location to another in the Obsidian vault.";
export const move_file_source = "Current path of the file to move.";
export const move_file_destination = "New destination path for the file. (You can use the same base path to rename the file, or move it to '.trash/' directory to delete it)";

export const list_files_description = `Lists the directory and file structure (optionally) from a root path, similar to the 'tree' command.`;
export const list_files_root = "The root folder path from where to start listing. Use '/' or '' for the vault root.";

export const query_desc = "Runs a fuzzy query over the tags to retrieve files";
export const query_pattern = "The pattern to match against tags in the files of the vault";