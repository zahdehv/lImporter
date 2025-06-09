import { App, FuzzySuggestModal, normalizePath, Notice, TFile } from "obsidian";

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
- paragraph level to extract full paragraphs (useful to get big chunks of context).
- sentence level to extract specific sentences (useful to extract atomic claims).
- keyword level (useful to extract entities or even tags).`,

    get_unresolved_links_desc = `Use this to get all the links to unexistent files.`,
    get_unresolved_links_expl = "Here you explain the reason to search the unresolved links. Be brief.",
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
  Considerations to create a new file:
  - A file can contain frontmatter, starting that file with:
  ---
  frontmatter_text: "An element of frontmatter"
  frontmatter_list:
  - item1
  - item2
  - etc
  frontmatter_bool: false
  ---

  - A file can contain links to other notes in the vault, in the form [[filename(no need to include the full path)|Name displayed in the Note(optional, if not necessary, do not use it)]]
  - Files can contain tags in the following way:
      - In the frontmatter, where no # is needed.
      - In the text, a #tagName can be anywhere.
      - The tag, begining with the #, and ending with the last letter, cannot contain any space (#Theory_of_Everything).
      - The tags can have a hierarchy, using '/' (e.g. #Computer_Science/Machine_Learning).
prompt: "You can check above are some files which content you must integrate in an existing knowledge base, you must the following process:
  1. Propose a plan based on the content of the files until it is accepted by the user (using the function).
  2. Given the content you want to create, ask any necessary question to verify if any information is already contained in the vault.
  3. Given the answers, including content already in the vault, create new .md notes linked to the ones existing, that answer jointly the question you asked."
plan: |-
  Considerations to create a new plan:
  - Be specific with the files and contents you want to include.
  - Be specific with the actions you will take at each step.
  - Take into account the requirements to create the new files.
---
`

export async function writeSpecs(app: App, specs: string): Promise<TFile> {
    console.debug("Writing settings file.");
    await app.vault.adapter.write("specs.lim.md", specs);
    await sleep(700);
    return app.vault.getFileByPath(normalizePath("specs.lim.md")) || writeSpecs(app, specs);
}

export async function getSpecs(app: App, field: string): Promise<string | undefined> {
    let file = app.vault.getFileByPath(normalizePath("specs.lim.md"));

    if (!file) {
        new Notice("Creating settings file.");
        await app.vault.create("specs.lim.md", DEFAULT_SPECS);
        await sleep(700);
        file = await writeSpecs(app, DEFAULT_SPECS);
    }
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    if (frontmatter) {
        try {
            const fieldValue = frontmatter[field]
            console.debug("Field: " + field);
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
    {
        id: 'The default specs, for each modification of these, a different specs file will be handed, that will determine the behaviour of the agent.',
        experiment_specs: `---
system: You have a set of tools you can use to help the user to add new content to its knowledge base.
write: |-
  Considerations to create a new file:
  - A file can contain frontmatter, starting that file with:
  ---
  frontmatter_text: "An element of frontmatter"
  frontmatter_list:
  - item1
  - item2
  - etc
  frontmatter_bool: false
  ---

  - A file can contain links to other notes in the vault, in the form [[filename(no need to include the full path)|Name displayed in the Note(optional, if not necessary, do not use it)]]
  - Files can contain tags in the following way:
      - In the frontmatter, where no # is needed.
      - In the text, a #tagName can be anywhere.
      - The tag, begining with the #, and ending with the last letter, cannot contain any space (#Theory_of_Everything).
      - The tags can have a hierarchy, using '/' (e.g. #Computer_Science/Machine_Learning).
prompt: "You can check above are some files which content you must integrate in an existing knowledge base, you must the following process:
  1. Propose a plan based on the content of the files until it is accepted by the user (using the function).
  2. Given the content you want to create, ask any necessary question to verify if any information is already contained in the vault.
  3. Given the answers, including content already in the vault, create new .md notes linked to the ones existing, that answer jointly the question you asked."
plan: |-
  Considerations to create a new plan:
  - Be specific with the files and contents you want to include.
  - Be specific with the actions you will take at each step.
  - Take into account the requirements to create the new files.
---
`},
    {
        id: `EXP 1: HARRY POTTER STRUCTURED (NO INC).`,
        experiment_specs: `---
system: You are a specialized AI that functions as a knowledge graph constructor. Your core task is to meticulously analyze a provided source text, identify entities and their relationships based on a predefined schema, and then generate a distinct Markdown file for each identified entity.

write: |-
  Each new file represents a single entity and must follow this structure. The placeholders (e.g., \`<ENTITY_NAME>\`) should be replaced with the extracted information.

  **CRITICAL FORMATTING RULES:**
  1.  **File Path:** The file for each entity must be placed in a folder named after its entity type in lowercase. The full path must be \`<entity_type_lowercase>/<ENTITY_NAME>.md\`. (e.g., A CHARACTER named "John Doe" becomes \`character/John Doe.md\`).
  2.  **Relations:** If an entity has the same relation to multiple other entities, each relation must be on a new line.

  ---
  # <ENTITY_NAME>

  ## Details
  - <SUMMARY_OR_DETAILS_EXTRACTED_FROM_SOURCE>

  ## Relations
  # Example of correct relation formatting:
  # IS_FRIEND_OF:: [[Jane Smith]]
  # IS_FRIEND_OF:: [[Robert Brown]]
  # BELONGS_TO:: [[The Guild]]
  <RELATION_TYPE>:: [[<RELATED_ENTITY_NAME>]]

prompt: |-
  Analyze the provided source text. Your goal is to identify all relevant entities and relationships according to the schema below. For each unique entity you find, generate the content for a new Markdown file using the format and CRITICAL FORMATTING RULES specified in the 'write' section of this configuration.

  ### Extraction Schema

  **1. Entities to Extract:**
  - CHARACTER
  - ORGANIZATION
  - LOCATION
  - ITEM
  - CONCEPT

  **2. Relations to Identify:**
  Identify connections between entities based on these triplets ([ENTITY_1, RELATION_NAME, ENTITY_2]):
  - [CHARACTER, BELONGS_TO, ORGANIZATION]
  - [CHARACTER, IS_FRIEND_OF, CHARACTER]
  - [CHARACTER, IS_ENEMY_OF, CHARACTER]
  - [CHARACTER, HAS_USED, ITEM]
  - [CHARACTER, HAS_OWN, ITEM]
  - [CONCEPT, RELATED_TO, ANY_ENTITY]
---
`},








// churre
{
    id: `hp test inc.`,
    experiment_specs: `---
system: You are a meticulous AI agent specializing in managing a knowledge base of characters. Your function is to analyze source texts, integrate new information into an existing vault structure, and ensure the integrity of the knowledge base by following a precise, multi-step process.

write: |-
  Each new character file must adhere strictly to the following format and rules, which are determined by the extraction process.

  **CRITICAL FORMATTING RULES:**
  1.  **File Path:** The file path is dynamically generated based on the character's house: \`<house_name_lowercase>/<CHARACTER_NAME>.md\`. (e.g., A character in Gryffindor named "Harry Potter" becomes \`gryffindor/Harry Potter.md\`).
  2.  **Tagging:** The character's house must also be included as a lowercase tag in the frontmatter.

  ---
  type: character
  tags: [character, <house_name_lowercase>]
  ---
  
  # <CHARACTER_NAME>

  ## Details
  - <SUMMARY_OF_CHARACTER_DETAILS_EXTRACTED_FROM_SOURCE>

  ## Relations
  # Example of correct formatting for a Gryffindor student:
  # BELONGS_TO:: [[Gryffindor]]
  # IS_FRIEND_OF:: [[Ron Weasley]]
  # IS_ENEMY_OF:: [[Draco Malfoy]]
  <RELATION_TYPE>:: [[<RELATED_ENTITY_NAME>]]

prompt: |-
  You are to process a provided source text to update a knowledge vault about characters from the world of Harry Potter. You must follow this three-step procedure exactly:

  **Step 1: Analyze Existing Vault Structure**
  First, you will be provided with a tree-like representation of the current vault (e.g., \`gryffindor/\`, \`slytherin/\`, etc.). Review this structure to understand which characters already exist.

  **Step 2: Extract, Create, and Update**
  Next, meticulously analyze the provided source text.

    *Primary Directive: House Classification*
    For each character identified, your **first and most important task** is to determine their Hogwarts House: \`Gryffindor\`, \`Hufflepuff\`, \`Ravenclaw\`, or \`Slytherin\`.
    -   This House affiliation dictates the **output folder** and the **metadata tag** for the character's file, as specified in the 'write' section.
    -   **If a character's house cannot be determined** from the text, place their file in an \`unassigned/\` directory and use the tag \`unassigned\`.

    *Secondary Directive: Data Extraction*
    Once the house is classified, extract additional details and relationships.
    -   **For new characters:** Generate the complete file content using the format from the 'write' section, placing it in the correct house folder.
    -   **For existing characters:** Propose updates to their file with any new information found.
    -   **Relations to Identify:** \`BELONGS_TO\`, \`IS_FRIEND_OF\`, \`IS_ENEMY_OF\`, \`IS_FAMILY_OF\`, \`MENTORS\`, \`IS_MENTORED_BY\`.

  **Step 3: Report Unresolved Links**
  Finally, after generating all new and updated content, perform a verification check. Create a list of any character or house names that are linked (\`[[link]]\`) but do not have a corresponding file in the vault. Present this as an "Unresolved Links Report".
---`},
{
    id: `Structured extraction experiment.
Requires Dataview and Graph Link Types plugins.`,
    experiment_specs: `---
system: You are a specialized AI that functions as a knowledge graph constructor. Your core task is to meticulously analyze a provided source text, identify entities and their relationships based on a predefined schema, and then generate a distinct Markdown file for each identified entity.

write: |-
Each new file represents a single entity and must follow this structure. The placeholders (e.g., \`<ENTITY_NAME>\`) should be replaced with the extracted information.

**CRITICAL FORMATTING RULES:**
1.  **File Path:** The file for each entity must be placed in a folder named after its entity type in lowercase. The full path must be \`<entity_type_lowercase>/<ENTITY_NAME>.md\`. (e.g., A CHARACTER named "John Doe" becomes \`character/John Doe.md\`).
2.  **Relations:** If an entity has the same relation to multiple other entities, each relation must be on a new line.

---
# <ENTITY_NAME>

## Details
- <SUMMARY_OR_DETAILS_EXTRACTED_FROM_SOURCE>

## Relations
# Example of correct relation formatting:
# IS_FRIEND_OF:: [[Jane Smith]]
# IS_FRIEND_OF:: [[Robert Brown]]
# BELONGS_TO:: [[The Guild]]
<RELATION_TYPE>:: [[<RELATED_ENTITY_NAME>]]

prompt: |-
Analyze the provided source text. Your goal is to identify all relevant entities and relationships according to the schema below. For each unique entity you find, generate the content for a new Markdown file using the format and CRITICAL FORMATTING RULES specified in the 'write' section of this configuration.

### Extraction Schema

**1. Entities to Extract:**
- CHARACTER
- ORGANIZATION
- LOCATION
- ITEM
- CONCEPT

**2. Relations to Identify:**
Identify connections between entities based on these triplets ([ENTITY_1, RELATION_NAME, ENTITY_2]):
- [CHARACTER, BELONGS_TO, ORGANIZATION]
- [CHARACTER, IS_FRIEND_OF, CHARACTER]
- [CHARACTER, IS_ENEMY_OF, CHARACTER]
- [CHARACTER, HAS_USED, ITEM]
- [CHARACTER, HAS_OWN, ITEM]
- [CONCEPT, RELATED_TO, ANY_ENTITY]
---
`},
]

export class PromptSuggestionModal extends FuzzySuggestModal<{ id: string; experiment_specs: string }> {
    private didSubmit: boolean = false;

    constructor(
        app: App,
        private callback: (prompt: string) => void
    ) {
        super(app);
    }

    getItems(): { id: string; experiment_specs: string }[] {
        return experiment_prompts;
    }

    getItemText(prompt: { id: string; experiment_specs: string }): string {
        return prompt.id;
    }

    onChooseItem(prompt: { id: string; experiment_specs: string }): void {
        this.didSubmit = true;
        this.callback(prompt.experiment_specs);
    }

    onClose(): void {
        // if (!this.didSubmit) {
        //     this.callback("");
        // }
    }
}