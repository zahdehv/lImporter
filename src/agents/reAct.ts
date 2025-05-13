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

import { createObsidianTools } from "../utils/tools";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ZodObject, ZodTypeAny } from "zod";


export class reActAgent {
    public agent: CompiledStateGraph<any,any,any>;

    constructor(plugin: MyPlugin, model: string, tools: DynamicStructuredTool<ZodObject<{}, "strip", ZodTypeAny, {}, {}>>[]) {

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
      
  
  this.agent = workflow.compile()

    }
    
 }