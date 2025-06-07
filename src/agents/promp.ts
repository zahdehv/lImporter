import { App, FuzzySuggestModal, Notice } from "obsidian";

export enum prompts {
    // ReAct PLAN AND SOLVE
    plan_and_solve_innit = `You can check above are some files which content you must integrate in an existing knowledge base, you must the following process:
1. Propose a plan based on the content of the files until it is accepted by the user (using the function).
2. Create a question, which, if a correct answer is provided, would include all the relevant information that the files contain, that you will use to ask the vault using the tool.
3. Given the answers, including content already in the vault, create new .md notes linked to the ones existing, that answer jointly the question you asked.`,
    // ReAct basic agent
    react_system_prompt = `You are a helpful NoteWriter, when you have files you capture esential keypoints among them and
write them on the respective files, first checking they do not already exist, and providing high quality condensed content to the
vault.`,
    react_starter_prompt = `Given the files you have to process, you must create notes on Obsidian in the correct .md format.`,

    //generate question
    generate_question_prompt = `Generate a question, which, if an answer is provided, would include all the relevant information that the files contain.
Your answer must contain only that question.`,
    //Extraction prompts
    extract_paragraph = `Extract all the paragraphs that support answering the following question: '`,
    extract_keywords = `Extract all the keywords that support answering the following question: '`,
    extract_sentence = `Extract all the sentences that support answering the following question: '`,
    extract_suffix = `', and mention the file it is included in.`,

    // TOOLS
    mkdir_description = `Used to create a folder.`,
    mkdir_folderpath = `Path to the folder to create.`, // This line was already in English

    write_description = `Used to create markdown (.md) files.`,
    write_folderpath = `Path to the folder to create the file in.`, // This line was already in English
    write_filename = `File name. File name cannot contain any of the following characters: * " \ / < > : | ?`,
    write_content = `Content to be written to the file.`,

    move_file_description = "Moves a file from one location to another in the Obsidian vault.",
    move_file_source = "Current path of the file to move.",
    move_file_destination = "New destination path for the file. (You can use the same base path to rename the file, or move it to '.trash/' directory to delete it).",

    list_files_description = `Lists the directory and file structure (optionally) from a root path, similar to the 'tree' command.`,
    list_files_root = "The root folder path from where to start listing. Use '/' or '' for the vault root.",
    list_files_include_files = "Wether to include the files instead of just folders.",

    openfile_desc = "Opens a file in the vault to check its contents.",
    openfilepath = "The path of the file to open.",

    end_session = `Use this function to end the agent loop after the final answer was given.`,
    end_reason = `Reason to end the agent loop. Maybe the task was finished or there exist another reason.`,

    plan = `Propose a plan to create some files based on the previously provided information.`,
    plan_desc = `The proposed plan, must be a enumerated list of well defined steps to follow.`,

    ask_files_desc = `Use this function to ask the files, it will return relevant items among the files that support answering that question.`,
    ask_files_question = `The question that must be answered using the files in the vault.
You can include specific aspects you are looking for in the selected level.`,
    ask_files_level = `You must specify the level of extraction:
- paragraph level to extract full paragraphs
- sentence level to extract specific sentences
- keyword level, useful to extract key entities or even tags`
}

// export async function getWriteSpecs(app: App) {
//     const files: TFile[] = app.vault.getFiles();
//     if (!(files.length > 0)) return prompts.write_content;
//     const filtered = files.filter(val => (val.name.startsWith('write') && val.name.includes('.lim')));
//     const res: string[] = [];
//     for (let index = 0; index < filtered.length; index++) {
//         const file = filtered[index];
//         const content = await app.vault.cachedRead(file);
//         res.push(content);
//     }
//     return prompts.write_content + "\n User has also included preferences about the files content:\n" + res.join("\n");
// }

const DEFAULT_SPECS = `---
system: You have a set of tools you can use to help the user to add new content to its knowledge base.
write: |-
  - A file can contain frontmatter, starting that file with:
  ---
  frontmatter_text: "An element of frontmatter"
  frontmatter_list:
  - item1
  - item 2
  - etc
  frontmatter_bool: false
  ---

  - A file can contain links to other notes in the vault, in the form [[filename(no need to include the full path)|Name displayed in the Note(optional, if not necessary, do not use it)]]
  - Files can contain tags in the following way:
      - In the frontmatter, where no # is needed.
      - In the text, a #tagName can be anywhere.
      - The tag, begining with the #, and ending with the last letter, cannot contain any space (#Theory_of_Everything).
      - The tags can have a hierarchy, using '/' (e.g. #Computer_Science/Machine_Learning).
prompt: "You can check above are some files which content you must integrate in an existing knowledge base, you must the following process:\r

  1. Propose a plan based on the content of the files until it is accepted by the user (using the function).

  \r2. Create a question, which, if a correct answer is provided, would include all the relevant information that the files contain, that you will use to ask the vault using the tool.\r

  3. Given the answers, including content already in the vault, create new .md notes linked to the ones existing, that answer jointly the question you asked."
---
`
export async function getSpecs(app: App, field: string): Promise<string | undefined> {
    let file = app.vault.getMarkdownFiles().find(file => file.name.includes("specs.lim"));

    while (!file) {
        new Notice("Creating settings file.");
        await app.vault.create("specs.lim.md", DEFAULT_SPECS);
        await sleep(700);
        file = app.vault.getMarkdownFiles().find(file => file.name.includes("specs.lim"));
    }
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    if (frontmatter) {
        try {
            const fieldValue = frontmatter[field]
            console.debug("Field: "+field);
            console.debug(fieldValue);
            return fieldValue;
        }
        catch (error) {
            return undefined;
        }
    }
    return undefined;
}

//Experiments
const experiment_prompts = [
    {id: 'Default Prompt', prompt_text:`You can check above are some files which content you must integrate in an existing knowledge base, you must the following process:
1. Propose a plan based on the content of the files until it is accepted by the user (using the function).
2. Create a question, which, if a correct answer is provided, would include all the relevant information that the files contain, that you will use to ask the vault using the tool.
3. Given the answers, including content already in the vault, create new .md notes linked to the ones existing, that answer jointly the question you asked.`},
]

export class PromptSuggestionModal extends FuzzySuggestModal<{id: string; prompt_text: string}> {
    private didSubmit: boolean = false;

    constructor(
        app: App,
        private callback: (prompt: string) => void
    ) {
        super(app);
    }

    getItems(): {id: string; prompt_text: string}[] {
        return experiment_prompts;
    }

    getItemText(prompt: {id: string; prompt_text: string}): string {
        return prompt.id.toUpperCase() + ": "+prompt.prompt_text;
    }

    onChooseItem(prompt: {id: string; prompt_text: string}): void {
        this.didSubmit = true;
        this.callback(prompt.prompt_text);
    }

    onClose(): void {
        if (!this.didSubmit) {
            this.callback("");
        }
    }
}