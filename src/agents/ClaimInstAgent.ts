import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ToolNode } from '@langchain/langgraph/prebuilt';
import {
    StateGraph,
    MessagesAnnotation,
    END,
    START,
    CompiledStateGraph
} from "@langchain/langgraph/web";
import MyPlugin from "../main";
import { createObsidianTools } from "./utils/tools";

export class reActAgentClaimI {
    public agent: CompiledStateGraph<any,any,any>;
    private plugin: MyPlugin;

    constructor(plugin: MyPlugin) {
      this.plugin = plugin;

      const {writeFile, readFiles, moveFile, getGhostReferences, listFiles} = createObsidianTools(plugin);

     const agent_tools = [writeFile, readFiles, moveFile, getGhostReferences, listFiles]; // Added listFiles here

     const llm = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash", // Consider using a more capable model if needed
        temperature: 0.3,
        maxRetries: 7,
        apiKey: plugin.settings.GOOGLE_API_KEY,
        // streaming: true, // Streaming might need adjustments in how state/responses are handled

        // other params...
      }).bindTools(agent_tools);

    const toolNodeForGraph = new ToolNode(agent_tools);

    const shouldContinue = (state: typeof MessagesAnnotation.State) => {
        const { messages } = state;
        const lastMessage: any = messages[messages.length - 1];
        // Check if the last message is an AIMessage and has tool_calls
        if (lastMessage && lastMessage.tool_calls && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
             // Ensure tool_calls is not just an empty array or undefined
            return "tools";
        }
        return END;
    }

    const callModel = async (state: typeof MessagesAnnotation.State) => {
      const { messages } = state;
      const thinking = this.plugin.tracker.appendStep("Language Model", "Thinking...", "bot");
      try {
          const response = await llm.invoke(messages);
          thinking.updateState("complete", "Call Finished!");
          // Ensure the response is wrapped correctly for the state
          return { messages: [response] }; // Wrap in array if invoke returns single message
      } catch (error) {
          thinking.updateState("error", `LLM Error: ${error.message}`);
          console.error("LLM Invocation Error:", error);
          throw error; // Rethrow to potentially halt execution or be caught higher up
      }
    }

    const workflow = new StateGraph(MessagesAnnotation)
      // Define the two nodes we will cycle between
      .addNode("agent", callModel)
      .addNode("tools", toolNodeForGraph)
      .addEdge(START, "agent")
      // The conditional edge checks the output of the "agent" node
      .addConditionalEdges(
          "agent", // Source node
          shouldContinue, // Function to determine the next node
          {
              tools: "tools", // If shouldContinue returns "tools"
              [END]: END,     // If shouldContinue returns END
          }
      )
      .addEdge("tools", "agent"); // Always go back to the agent after tools run


    this.agent = workflow.compile()

    }

 }
