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


export class reActLiteAgentTEST {
    public agent: CompiledStateGraph<any,any,any>;
    // private plugin: MyPlugin;

    constructor(plugin: MyPlugin) {
        // this.plugin = plugin;

            
     const llm1 = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        temperature: 0.3,
        maxRetries: 7,
        apiKey: plugin.settings.GOOGLE_API_KEY,
        // streaming: true,
        
        // other params...
      })

      const llm2 = new ChatGoogleGenerativeAI({
        model: "gemini-2.0-flash",
        temperature: 0.3,
        maxRetries: 7,
        apiKey: plugin.settings.GOOGLE_API_KEY,
        // streaming: true,
        
        // other params...
      })
 
  
  
  const callModel1 = async (state: typeof MessagesAnnotation.State) => {
    console.log("calling model 1")
    const { messages } = state;
    const thinking = plugin.tracker.appendStep("Language Model", "Thinking...", "bot");
    const response = await llm1.invoke(messages);
    thinking.updateState("complete", "Call Finished!");
    console.log(response);
    return { messages: response.content };
  }
  const callModel2 = async (state: typeof MessagesAnnotation.State) => {
    console.log("calling model 2")
    const { messages } = state;
    const thinking = plugin.tracker.appendStep("Language Model", "Thinking...", "bot");
    const response = await llm2.invoke(messages);
    thinking.updateState("complete", "Call Finished!");
    console.log(response);
    return { messages: response };
  }
  
  const workflow = new StateGraph(MessagesAnnotation)
    // Define the two nodes we will cycle between
    .addNode("agent1", callModel1)
    .addNode("agent2", callModel2)
    .addEdge(START, "agent1")
    .addEdge("agent1", "agent2")
    .addEdge("agent2", END);
      
  
  this.agent = workflow.compile()

    }
    
 }