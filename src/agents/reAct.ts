import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { StateGraph, MessagesAnnotation, END, START } from "@langchain/langgraph/web";
import MyPlugin from "../main";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";
import { z, ZodObject, ZodTypeAny } from "zod";
import { captureGhosts, listFilesTree, writeFileMD } from "../utils/filesystem";
import { get_ghosts_description, list_files_depth, list_files_description, list_files_includeFiles, list_files_root, move_file_description, move_file_destination, move_file_source, write_content, write_description, write_path } from "./promp";


export function createObsidianTools(plugin: MyPlugin) {

  const vault = plugin.app.vault;
  const tracker = plugin.tracker;

  //WRITE FILES
  const writeFile = tool(async (input: { path: string, content: string }) => {
      return new Promise(async (resolve, reject) => {
          const wrt_trk = tracker.appendStep("Write File", input.path, "file-edit");
          try {
              const diff = await writeFileMD(plugin.app, input.path, input.content);
              if (diff) console.log(`# File wrote '${input.path}'

${diff}`);
              else reject(new Error("Error writing file"));
              
              wrt_trk.updateState("complete");
              tracker.appendFile(input.path);
              resolve(`El llamado a funcion se completo correctamente.`);

              
          } catch (error) {
              console.error("Error preparing file write:", error);
              wrt_trk.updateState("error", error);
              reject(new Error(`Error preparing file write: ${error}`));
          }
      });
  }, {
      name: "writeFile",
      description: write_description,
      schema: z.object({
          path: z.string().describe(write_path),
          content: z.string().describe(write_content),
      }),
  });

  //MOVE FILE
  const moveFile = tool(async (input: { sourcePath: string, targetPath: string }) => {
      return new Promise(async (resolve, reject) => {
          const move_trk = tracker.appendStep("Move File", `${input.sourcePath} -> ${input.targetPath}`, "scissors");
          try {
              if (input.sourcePath.includes(".lim")) {
                  // throw new Error("Cannot move a .lim file");
                  move_trk.updateState("error", "Cannot move a .lim file");
                  reject(new Error("Cannot move a .lim file"));
                  return;
              }
              
              const file = vault.getAbstractFileByPath(input.sourcePath);
              if (!file) {
                  const errorMsg = `File not found: ${input.sourcePath}`;
                  move_trk.updateState("error", errorMsg);
                  reject(new Error(errorMsg));
                  return;
              }

              const targetDir = input.targetPath.split('/').slice(0, -1).join('/');
              if (targetDir && !await vault.adapter.exists(targetDir)) {
                  await vault.createFolder(targetDir);
              }

              await vault.rename(file, input.targetPath);
              move_trk.updateState("complete");
              if (plugin.settings.track_ReadFiles) tracker.appendFile(input.targetPath);
              resolve(`File moved successfully from ${input.sourcePath} to ${input.targetPath}`);
          } catch (error) {
              move_trk.updateState("error", error);
              console.error("Error moving file:", error);
              reject(new Error(`Error moving file: ${error}`));
          }
      });
  }, {
      name: "moveFile",
      description: move_file_description,
      schema: z.object({
          sourcePath: z.string().describe(move_file_source),
          targetPath: z.string().describe(move_file_destination)
      }),
  });

  // GHOST REFERENCES
  const getGhostReferences = tool(async () => {
      return new Promise(async (resolve, reject) => {
          const ghost_track = tracker.appendStep("Search ghosts", "Unresolved Links Check", "ghost");
          try {
              const ghostRefs = captureGhosts(plugin.app);
              if (ghostRefs.length === 0) {
                  ghost_track.updateState("complete");
                  resolve("No se encontraron referencias no resueltas (ghost references) en la bóveda.");
              } else {
                  const result = ghostRefs.map(ref =>
                      `Archivo: ${ref.sourceFile}\nEnlace no resuelto: ${ref.unresolvedLink}`
                  ).join('\n---\n');
                  // Ghost refs found is a 'pending' state for the overall check, action might be needed
                  ghost_track.updateState("pending", `Found ${ghostRefs.length} unresolved links`);
                  resolve(`Referencias no resueltas encontradas:\n\n${result}`);
              }
          } catch (error) {
              ghost_track.updateState("error", error);
              console.error("Error searching ghost references:", error);
              reject(new Error(`Error buscando referencias no resueltas: ${error}`));
          }
      });
  }, {
      name: "getGhostReferences",
      description: get_ghosts_description,
      schema: z.object({}) // No input arguments needed
  });

  //LIST FILES
  const listFiles = tool(async (input: { rootPath: string, depth: number, includeFiles: boolean }) => {
      return new Promise(async (resolve, reject) => {
          const list_trk = tracker.appendStep("List Directory", `Path: ${input.rootPath}, Depth: ${input.depth}`, "folder-tree");
          try {
              const { rootPath, depth, includeFiles } = input;
              
              const finalResult = await listFilesTree(plugin.app, rootPath, depth, includeFiles, true, 23);
              list_trk.updateState("complete", `Listed structure for ${rootPath}`);
              console.log(finalResult);
              resolve(finalResult);

          } catch (error) {
              list_trk.updateState("error", error);
              console.error("Error in listFiles tool:", error);
              reject(new Error(`Error listing directory structure: ${error.message || error}`));
          }
      });
  }, {
      name: "listFiles",
      description: list_files_description,
      schema: z.object({
          rootPath: z.string().describe(list_files_root),
          depth: z.number().int().min(1).describe(list_files_depth),
          includeFiles: z.boolean().describe(list_files_includeFiles)
      }),
  });


  return {
      writeFile,
      //query
      moveFile,
      getGhostReferences,
      listFiles,
  };
}



//The AGENT
export function createReActAgent(plugin: MyPlugin, model: string, tools: DynamicStructuredTool<ZodObject<{}, "strip", ZodTypeAny, {}, {}>>[]){
  const llm = new ChatGoogleGenerativeAI({
    model: model,
    temperature: 0.6,
    maxRetries: 7,
    apiKey: plugin.settings.GOOGLE_API_KEY,
  }).bindTools(tools);

  const toolNodeForGraph = new ToolNode(tools);

  const shouldContinue = (state: typeof MessagesAnnotation.State) => {
      const { messages } = state;
      const lastMessage: any = messages[messages.length - 1];
      if ("tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls?.length) {
          return "tools";
      }
      return END;
  }

  const callModel = async (state: typeof MessagesAnnotation.State) => {
  const { messages } = state;
  const thinking = plugin.tracker.appendStep("Language Model", "Thinking...", "bot");
  const response = await llm.invoke(messages);
  thinking.updateState("complete", "Call Finished!");
  return { messages: response };
  }

  const workflow = new StateGraph(MessagesAnnotation)
  // Define the two nodes we will cycle between
  .addNode("agent", callModel)
  .addNode("tools", toolNodeForGraph)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue, ["tools", END])
  .addEdge("tools", "agent");
    

  const agent = workflow.compile()
  return agent;
}