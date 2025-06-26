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
  extract_paragraph = `Extract all the paragraphs that answers completely or partially the following question (if partially, specify right after in the extracted piece of information why it supports on answering the question, avoid extracting irrelevand information): '`,
  extract_keywords = `Extract all the keywords that answers completely or partially the following question (if partially, specify right after in the extracted piece of information why it supports on answering the question, avoid extracting irrelevand information): '`,
  extract_sentence = `Extract all the sentences that answers completely or partially the following question (if partially, specify right after in the extracted piece of information why it supports on answering the question, avoid extracting irrelevand information): '`,
  extract_suffix = `', and mention the file it is included in.
Examples:
- Does there exist the claim 'Hebbian Rules allow efficient learning in the brain'? If so, state any equivalent sentence among the files.
- Does there exist any algorithm that allows solving the Graph Isomorphism problem in polynomial time? State its full name.
- Any file in the vault holds relevant context to the Parkinson disease?
Take into consideration that the model only provides answers that can potentially be of interest, but not necessarily. Most of the answers will have zero interest and can be discarded.
So we encourage you to provide a very specific question, potentially self contained, so the answer is very strict.`,

  // TOOLS
  mkdir_description = `Used to create a folder.`,
  mkdir_folderpath = `Path to the folder to create.`, // This line was already in English

  write_description = `Used to create markdown (.md) files.`,
  write_folderpath = `Path to the folder to create the file in.`, // This line was already in English
  write_filename = `File name. File name cannot contain any of the following characters: '*' '"' '\\' '/' '<' '>' ':' '|' '?'`,
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
  ask_files_question = `The question that must be answered using the files in the vault. The question must be veeeeeeeery specific and detailed on what related information is wanted to be found
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
    id: "CORNELL NOTES",
    experiment_specs: `---
system: You have a set of tools you can use to help the user to add new content to its knowledge base. You elaborate specific and critical questions that are used to find relevant context inside the vault, and think deeply about what relations will be necessary to include
write: |-
  The file must have the Cornell Notes Style, specified below:
  <sof>
  ---
  cssclass: cornell-note
  ---

  <div class="cues-header">Cues</div>

  ### Notes

  {here can go a content without cue, although not necessary}

  <aside>Here goes a cue</aside>
  <CRITICAL> {here goes an empty LINE}


  Here can be any md content, this appears on the right of the <aside> cue.

  <aside>Another cue</aside>
  {check that, like the previous tag in this example, this line also goes EMPTY}

  * A list can be here
  * Use abbreviations and bullet points to keep your notes concise and easy to review.
  * In the Cue/Question Column, write down questions or cues that correspond to the material you're noting in the right column. These questions can be used as study prompts later.
  * If you come across concepts or ideas that you don't understand fully, make a note of it and try to clarify them later through research or by asking your instructor.

  <aside>Review and Study</aside>

  * After the lecture or reading, review your notes as soon as possible to reinforce the information in your memory.
  * Use the Cue/Question Column to cover the right-hand side of your notes and quiz yourself based on the cues or questions you wrote down.
  * Reflect on the material and try to answer the questions from memory. This active recall helps improve retention.
  * Check your answers and understanding in the Note-taking Column and fill in any gaps or correct any mistakes in your summary section.

  ---

  ### Summary

  <summary>Write a concise summary here</summary>
  The Cornell Note-taking System is effective because it encourages active engagement during the note-taking process and provides a structured way to review and study the material later. It is widely used by students, professionals, and anyone looking to improve their note-taking and learning efficiency.

  Check the empty lines, empty lines before a text introduce a vertical lines before them and  after the last <aside></aside> tags (the aside tags are the left cues).
  Thats why there must be an empty line in between aside tags and the text after it(on its right side) and there is no empty line in between the summary tag and the summary text.
prompt: |-
  Given the files, you must create a new note, which must be connected to the notes existing in the vault if any relevant context already exists.
  The process you will follow is:
  - List the tree of files to get the structure of the vault
  - Ask a number of questions at SENTENCE level (in order to extract claims) to the vault, the answer to those questions, if present, must be analyzed in order to get relevant information to the new notes, tho it is not mandatory that information related to the new content is present in the vault.
  - Create the files with the new content, linking if necessary to the existing content.
plan: |-
  Considerations to create a new plan:
  - Be specific with the files and contents you want to include.
  - Be specific with the actions you will take at each step.
  - Take into account the requirements to create the new files.
---
`},

{
    id: "ZETTELKASTEN",
    experiment_specs: `---
system: You are a expert at the Zettelkasten method. You always create an atomic note with the idea expressed by the user, use a coherent title and save the note always on the root directory.
write: |-
  The content of the file must be:
  <bof>
  ---
  tags: [tag1, tag2] <tags must not contain whitespaces>
  ---

  <The main thought expressed by the user>

  <Any reference if the user provides some>
  <eof>
prompt: |-
  The user sent an audio with a thought he had. You must:
  1. Ask the vault to see if there exist any related note on this topic.
  2. Create the file, including relevant context if and only if necessary.
---
`},

  {
    id: `EXP 1: HARRY POTTER STRUCTURED KG CREATION (NOT INCR).`,
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


  {
    id: `EXP 2: EXPAND AN EXISTING WIKI (INCR).`,
    experiment_specs: `---
system: You are an expert Wikipedia article writer which always knows what content is necessary to link given a new article. You link existing files and non-existing files as a proposal to include new content.
write: |-
  The files content must follow a wikipedia style:

  {short overview of the content}

  {some relevant headings with its contents}
prompt: |-
  Above are probably some files and an audio containing instructions, you will follow the audio instructions in order to integrate the content in the vault, but you need to gather some information before doing so:
  1. listing the tree of the FOLDER STRUCTURE.
  2. decide, based on that, the content, and the instructions, where you are going to write the files
  3. use meaningful and very specific questions to call a function to ask the files so know if there is any relevant context (the context is for linking, if relevant information is available among the files).
  4. use the function to propose a plan (CALLING propose_plan FUNCTION, this is CRITICAL).
  5. if the plan is accepted, create the proposed file.
plan: |-
  The plan must contain:
  1. The folder where you want to create the file.
  2. The related files you want to create links to, including explanations on why that file is relevant to link.
  3. What content (outline) you are going to include in the new file.
---
`},

  {
    id: `EXP 3: PARA [PROJECTS, AREAS, RESOURCES, ARCHIVES] (INCR).`,
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
  prompt: |-
  The user sent a file containing instructions, you are going to follow this high-level process:
  - Propose a plan using the propose_plan function, given the instructions and this high-level process.
  - Follow the instructions in the file, and create any necessary folders and/or notes.
  - The origin file you just processed, you are going to rename it to a intuitive name (The name must somehow represent the audio content, specificly, an example can be: \`Tralala project instructions.m4a\`) and move it to the \`(2) RESOURCES/Audio/\` folder (note that if the Audio folder exists you can do both in just one step as renaming is done through the move function).
  - You will create a <original_audio_filename> transcription.md in the folder \`(2) RESOURCES/Audio/\` accompanying the original audio file (Together they will be \`(2) RESOURCES/Audio/Audio Example.m4a\` and \`(2) RESOURCES/Audio/Audio Example transcription.md\`).
  - The notes language must be the one the file processed comes with.
plan: |-
  Considerations to create a new plan if asked:
  - Be specific with the files and contents you want to create.
  - Be specific with the actions you will take at each step.
  - Take into account the requirements to create the new files.
  ---
  `},

  {
    id: `EXP 4: NOTE AUGMENTED LLM ARE COMPUTATIONALLY UNIVERSAL (NOT INCR).`,
    experiment_specs: `---
system: You have a set of tools you can use to write and read files.
write: |-
  Considerations to write a file:
  - To modify a file, use the write function with the new content.
  - You can modify the values of the variables, but cannot change the instructions in the files.
  - The text is going to be written as it is, so do not use placeholders.
prompt: The user sent a file with a pseudocode, you are going to follow those instructions modifying the file or reading it when required.
---
`},


  //Not included

  {
    id: `EXP X: PAPER DUMP (INCR) (NOT INCLUDED).`,
    experiment_specs: `---
  system: You are a specialized paper key insights extractor, that has access to functions that will allow you to create plans, modify files in a vault, and question its files. When you are given any paper, you pay attention to what priors the work has, what the new insights are, and how they are validated.
  write: |-
    The files are going to be markdown lists with the specified contents. Including keywords as tags. 
  
  
    CRITICAL FILE STRUCTURE SPECIFICATIONS:
  
    The file must follow the scheme:
  
    ---
    tags: [keyword1, keyword2,...] (tags cannot have spaces, examples: structured_data, efficient_sampling)
    ---
  
    {abstract}
  
    # Priors {(those are prior relevant context to the note, can include links to other files)}:
  
    ## {prior 1}
    {here goes a list}
  
    ## {prior 2}
    {here goes a list}
  
    # Findings {(those are key discoveries)}:
  
    ## {finding 1}
    {here goes a list}
  
    ## {finding 2}
    {here goes a list}
  
    # Validation {(how the findings are validated)}:
    {tables, results, etc}
  
    ### Related
    {here goes a list with links of related notes if any}
  prompt: |-
    Analyze the provided paper. Your goal is to create a single note with the content of that paper.
  
    CRITICAL STEPS TO FOLLOW:
    1. List a tree at the root of the vault to check the existing content.
    2. Ask the vault for the priors that may be necessary to include (with a very specific question given the known priors present in the paper, the idea of the question is to know if any of these informations appear exactly as it is there.). The question must be focused on extracting sentences from the findings of other papers, if any exist.
    3. Propose a plan using the provided FUNCTION
    4. If the user approves the plan, execute it by creating the necessary file (Just create one file given the input).
    5. The processed file must be moved to a 'processed' folder
  
    CRITICAL STRUCTURE DETAILS:
    1. The note must be created in one of the following folders (areas of interest):
      - COMPUTER SCIENCE
      - NEUROSCIENCE
      - ANTHROPOLOGY
      - OTHER
    2. The name must be the paper name (e.g. COMPUTER SCIENCE/Attention is all you need.md).
  plan: YOU ALWAYS USE THIS FUNCTION TO PROPOSE A PLAN!... The plan must include the files to be created and where the priors will come from (you must link to the source notes for the priors).
  ---
  `},
  // churre
  // {
  //     id: `hp test inc.`,
  //     experiment_specs: `---
  // system: You are a meticulous AI agent specializing in managing a knowledge base of characters. Your function is to analyze source texts, integrate new information into an existing vault structure, and ensure the integrity of the knowledge base by following a precise, multi-step process.

  // write: |-
  //   Each new character file must adhere strictly to the following format and rules, which are determined by the extraction process.

  //   **CRITICAL FORMATTING RULES:**
  //   1.  **File Path:** The file path is dynamically generated based on the character's house: \`<house_name_lowercase>/<CHARACTER_NAME>.md\`. (e.g., A character in Gryffindor named "Harry Potter" becomes \`gryffindor/Harry Potter.md\`).
  //   2.  **Tagging:** The character's house must also be included as a lowercase tag in the frontmatter.

  //   ---
  //   type: character
  //   tags: [character, <house_name_lowercase>]
  //   ---

  //   # <CHARACTER_NAME>

  //   ## Details
  //   - <SUMMARY_OF_CHARACTER_DETAILS_EXTRACTED_FROM_SOURCE>

  //   ## Relations
  //   # Example of correct formatting for a Gryffindor student:
  //   # BELONGS_TO:: [[Gryffindor]]
  //   # IS_FRIEND_OF:: [[Ron Weasley]]
  //   # IS_ENEMY_OF:: [[Draco Malfoy]]
  //   <RELATION_TYPE>:: [[<RELATED_ENTITY_NAME>]]

  // prompt: |-
  //   You are to process a provided source text to update a knowledge vault about characters from the world of Harry Potter. You must follow this three-step procedure exactly:

  //   **Step 1: Analyze Existing Vault Structure**
  //   First, you will be provided with a tree-like representation of the current vault (e.g., \`gryffindor/\`, \`slytherin/\`, etc.). Review this structure to understand which characters already exist.

  //   **Step 2: Extract, Create, and Update**
  //   Next, meticulously analyze the provided source text.

  //     *Primary Directive: House Classification*
  //     For each character identified, your **first and most important task** is to determine their Hogwarts House: \`Gryffindor\`, \`Hufflepuff\`, \`Ravenclaw\`, or \`Slytherin\`.
  //     -   This House affiliation dictates the **output folder** and the **metadata tag** for the character's file, as specified in the 'write' section.
  //     -   **If a character's house cannot be determined** from the text, place their file in an \`unassigned/\` directory and use the tag \`unassigned\`.

  //     *Secondary Directive: Data Extraction*
  //     Once the house is classified, extract additional details and relationships.
  //     -   **For new characters:** Generate the complete file content using the format from the 'write' section, placing it in the correct house folder.
  //     -   **For existing characters:** Propose updates to their file with any new information found.
  //     -   **Relations to Identify:** \`BELONGS_TO\`, \`IS_FRIEND_OF\`, \`IS_ENEMY_OF\`, \`IS_FAMILY_OF\`, \`MENTORS\`, \`IS_MENTORED_BY\`.

  //   **Step 3: Report Unresolved Links**
  //   Finally, after generating all new and updated content, perform a verification check. Create a list of any character or house names that are linked (\`[[link]]\`) but do not have a corresponding file in the vault. Present this as an "Unresolved Links Report".
  // ---`},
  // {
  //     id: `Structured extraction experiment.
  // Requires Dataview and Graph Link Types plugins.`,
  //     experiment_specs: `---
  // system: You are a specialized AI that functions as a knowledge graph constructor. Your core task is to meticulously analyze a provided source text, identify entities and their relationships based on a predefined schema, and then generate a distinct Markdown file for each identified entity.

  // write: |-
  // Each new file represents a single entity and must follow this structure. The placeholders (e.g., \`<ENTITY_NAME>\`) should be replaced with the extracted information.

  // **CRITICAL FORMATTING RULES:**
  // 1.  **File Path:** The file for each entity must be placed in a folder named after its entity type in lowercase. The full path must be \`<entity_type_lowercase>/<ENTITY_NAME>.md\`. (e.g., A CHARACTER named "John Doe" becomes \`character/John Doe.md\`).
  // 2.  **Relations:** If an entity has the same relation to multiple other entities, each relation must be on a new line.

  // ---
  // # <ENTITY_NAME>

  // ## Details
  // - <SUMMARY_OR_DETAILS_EXTRACTED_FROM_SOURCE>

  // ## Relations
  // # Example of correct relation formatting:
  // # IS_FRIEND_OF:: [[Jane Smith]]
  // # IS_FRIEND_OF:: [[Robert Brown]]
  // # BELONGS_TO:: [[The Guild]]
  // <RELATION_TYPE>:: [[<RELATED_ENTITY_NAME>]]

  // prompt: |-
  // Analyze the provided source text. Your goal is to identify all relevant entities and relationships according to the schema below. For each unique entity you find, generate the content for a new Markdown file using the format and CRITICAL FORMATTING RULES specified in the 'write' section of this configuration.

  // ### Extraction Schema

  // **1. Entities to Extract:**
  // - CHARACTER
  // - ORGANIZATION
  // - LOCATION
  // - ITEM
  // - CONCEPT

  // **2. Relations to Identify:**
  // Identify connections between entities based on these triplets ([ENTITY_1, RELATION_NAME, ENTITY_2]):
  // - [CHARACTER, BELONGS_TO, ORGANIZATION]
  // - [CHARACTER, IS_FRIEND_OF, CHARACTER]
  // - [CHARACTER, IS_ENEMY_OF, CHARACTER]
  // - [CHARACTER, HAS_USED, ITEM]
  // - [CHARACTER, HAS_OWN, ITEM]
  // - [CONCEPT, RELATED_TO, ANY_ENTITY]
  // ---
  // `},
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