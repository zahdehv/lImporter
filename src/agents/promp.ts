import { App, TFile } from "obsidian";

export enum prompts {
    react_system_prompt = `You are a helpful NoteWriter, when you have files you capture esential keypoints among them and
write them on the respective files, first checking they do not already exist, and providing high quality condensed content to the
vault.`,
    react_starter_prompt = `Given the files you have to process, you must create notes on Obsidian in the correct .md format.`,

    // TOOLS
    write_description = `Used to create markdown (.md) files.`,
    write_path = `Path to create or modify the file.
Example file names (path): 'cuban_art.md' or 'love/romance.md'.
Do not use accents in the title. If you use an existing file name, you will modify it
use it to correct errors if necessary.
File name cannot contain any of the following characters: * " \ / < > : | ?`, // This line was already in English
    write_content = `Content to be written to the file.

Specifications for writing content:
1. Files must contain tags in the following way:
    - In the text, a #tagName can be anywhere.
    - Any relevant entity must be represented using a #tag.
    - The tag, begining with the #, and ending with the last letter, cannot contain any space (#Theory_of_Everything).
    - The tags can have a hierarchy, using '/' (e.g. #Computer_Science/Machine_Learning).
2. Links are of the form [[filename(no need to include the full path)|Name displayed in the Note(optional, if not necessary, do not use it)]]
3. You can use all available Markdown language resources.`,

    move_file_description = "Moves a file from one location to another in the Obsidian vault.",
    move_file_source = "Current path of the file to move.",
    move_file_destination = "New destination path for the file. (You can use the same base path to rename the file, or move it to '.trash/' directory to delete it).",

    list_files_description = `Lists the directory and file structure (optionally) from a root path, similar to the 'tree' command.`,
    list_files_root = "The root folder path from where to start listing. Use '/' or '' for the vault root.",

    query_desc = "Runs a fuzzy query over the tags to retrieve files",
    query_pattern = "The pattern to match against tags in the files of the vault",
}

export async function getWriteSpecs(app: App) {
    const files: TFile[] = app.vault.getFiles();
    if (!(files.length > 0)) return prompts.write_content;
    const filtered = files.filter(val => (val.name.startsWith('write') && val.name.includes('.lim')));
    const res: string[] = [];
    for (let index = 0; index < filtered.length; index++) {
        const file = filtered[index];
        const content = await app.vault.cachedRead(file);
        res.push(content);
    }
    return prompts.write_content + "\n User has also included preferences about the files content:\n" + res.join("\n");
}