import lImporterPlugin from "src/main";

//Language Specification
export const getLanguageSpecification = (plugin: lImporterPlugin) => {
    // Add language option here!!!
    return `All files must be written in ${"ENGLISH"}`; // Changed SPANISH to ENGLISH
}

//FILE SPECIFICATIONS
const file_content_specifications = `Files must start with the header:
---
tags: 
- FirstTag (tags represent the concepts (conceptual entities) that appear in the document | tags must not have spaces)
- SecondTag (tags represent the concepts (conceptual entities) that appear in the document | tags must not have spaces)
keypoints:
- First key point, containing a fact or key information mentioned in the document
- Second key point, containing a fact or key information mentioned in the document
- Third key point, containing a supporting fact or information mentioned in the document
---

Other details:
- Keypoints should be shortcuts to the main content (Brief factual information that allows quick understanding of the file's content,
    therefore the file should go into greater depth)
- Links are of the form [[filename(no need to include the full path)|Name displayed in the Note]]
- You can use all available Markdown language resources.`;


//reAct
//prompts
export const react_starter_prompt = `Follow these instructions:
1. Pay attention to the file structure, particularly the information provided in the '.lim' files.
2. According to the instructions in those files and the files in the context, you must create or modify notes.
3. You must extract information from those files, do not copy/paste what they say.
4. Before finishing the process, you must check that there are no ghost references.`;

//tools
export const write_description = `Used to create markdown (.md) files.`;
export const write_path = `Path to create or modify the file.
Example file names (path): 'cuban_art.md' or 'love/romance.md'.
Do not use accents in the title. If you use an existing file name, you will modify it;
use it to correct errors if necessary.
File name cannot contain any of the following characters: * " \ / < > : | ?`; // This line was already in English
export const write_content = `Content to be written to the file.
Specifications for writing content:
\`\`\`
${file_content_specifications}
\`\`\``;

export const move_file_description = "Moves a file from one location to another in the Obsidian vault.";
export const move_file_source = "Current path of the file to move.";
export const move_file_destination = "New destination path for the file. (You can use the same base path to rename the file, or move it to .trash to delete it)";

export const get_ghosts_description = `Finds all unresolved links (ghost references)
in the Obsidian vault, and the files where they appear.
It should be used at the end to verify that everything is well connected.

These can be resolved by creating the missing file or renaming files,
if the link conflict is due to typos or writing errors.`;

export const list_files_description = `Lists the directory and file structure (optionally) from a root path, similar to the 'tree' command.`;
export const list_files_root = "The root folder path from where to start listing. Use '/' or '' for the vault root.";
export const list_files_depth = "The maximum recursion depth. 1 means list only the direct content of rootPath.";
export const list_files_includeFiles = "If true, includes files in the listing in addition to folders.";


//hcGem
//prompts
export const gem_extract_prompt = `From the files TO PROCESS extract:
- Claims (from the files in <|FILES TO PROCESS|>)
- Concepts (from the claims)
- Instructions (from the audios in <|FILES TO PROCESS|> or .lim files in <|VAULT DIRECTORY TREE|>)

and generate, to expand the information you have:
- Queries (searches are performed on keypoints, and tags on <|VAULT DIRECTORY TREE|> to show full content)`;
// and file titles 

export const gem_write_prompt = (plugin: lImporterPlugin) => {
    return `Now write the .md files, following the specifications:
${file_content_specifications}

File name cannot contain any of the following characters: * " \ / < > : | ? (e.g. Least Action principle.md)
The notes must be in the LANGUAGE: ${plugin.settings.LANGUAGE}`;}