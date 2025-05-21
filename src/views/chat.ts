import { Chat, FunctionCall, GenerateContentResponse, GoogleGenAI, Part } from "@google/genai";
import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, Setting, Notice } from "obsidian";
import { createFunctionHandler, toolsOnePass } from "src/agents/onePass";
import lImporterPlugin from "src/main";
import { prepareFileData, upload_file } from "src/utils/files";
import { geminiFormatters } from "src/utils/messages";

// Unique identifier for this view type
export const CHAT_VIEW_TYPE = "ai-chat-view";

export class ChatView extends ItemView {
    private plugin: lImporterPlugin;
    
    private inputEl: HTMLTextAreaElement;
    
    private ai: GoogleGenAI;
    private chat: Chat;

    private include_file: boolean = false;

    private handler: (functionCalls: FunctionCall[]) => Promise<Part[]>;
    private display: (text: string, sender: "User" | "AI")=> void;
    private stream: (answer: Promise<AsyncGenerator<GenerateContentResponse, any, any>>, sender: "User" | "AI") => Promise<void>

    private processing_message: boolean = false;
    
    constructor(leaf: WorkspaceLeaf, plugin: lImporterPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.icon = "bot-message-square"; // Set the icon for the view tab
        this.ai = new GoogleGenAI({apiKey: this.plugin.settings.GOOGLE_API_KEY});
        this.chat = this.ai.chats.create({model:"gemini-2.5-flash-preview-04-17"});
    }

    getViewType(): string {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "AI Chat"; // Title shown in the tab
    }

    getIcon(): string {
        return "bot-message-square"; // Icon for the view if it's not set in constructor or needs to be dynamic
    }

    async onOpen() {
        // `this.containerEl` is the root HTML element of the view.
        // It has two children: child[0] is the header, child[1] is the content area.
        const viewContent = this.containerEl.children[1];
        viewContent.empty(); // Clear any previous content
        viewContent.addClass("chat-view-container");

        // Add a title (optional, as the tab already has one)
        viewContent.createEl("h4", { text: "AI Assistant" });

        // Messages display area
        const fx = this.createSendingFunctions(viewContent);
        this.display = fx.display;
        this.stream = fx.stream;
        this.handler = createFunctionHandler(this.app, fx.display);

        new Setting(viewContent as HTMLElement)
            .setName("Include active file.")
            .setDesc("Passes the active file to the chat.")
            .addToggle((toggle) => toggle
                .setValue(this.include_file)
                .onChange((value) => this.include_file = value));

        // Input area
        const inputArea = viewContent.createDiv("chat-input-area");
                
        this.inputEl = inputArea.createEl("textarea", {
            attr: { placeholder: "Type your message... (Shift+Enter for new line)" },
            cls: "chat-input-textarea"
        });

        const sendButton = inputArea.createEl("button", {
            text: "Send",
            cls: "limporter-button primary" // "mod-cta" for primary action styling
        });
        setIcon(sendButton, "corner-down-left");

        // Event listeners
        sendButton.onClickEvent(await this.handleSendMessage.bind(this));

        this.inputEl.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Prevent default Enter behavior (new line in textarea)
                await this.handleSendMessage();
            }
        });

        // Initial welcome message (optional)
        this.display("Hello! How can I assist you today?", "AI");
    }

    private createSendingFunctions(element: Element){
        const messagesContainer = element.createDiv("chat-messages-container");
        messagesContainer.id = `${CHAT_VIEW_TYPE}-messages-display`; // Unique ID
        const display = (text: string, sender: "User" | "AI") => {
            if (!messagesContainer) return;
    
            const messageEl = messagesContainer.createDiv("chat-message");
            messageEl.addClass(sender === "User" ? "user-message" : "ai-message");
    
            // Sender label (optional, could be part of styling)
            // messageEl.createSpan({ cls: "chat-message-sender", text: `${sender}:` });
            
            // Message content - Rendered as Markdown
            const textContentEl = messageEl.createDiv({ cls: "chat-message-text" });
            MarkdownRenderer.render(this.app, text, textContentEl, this.getViewType(), this);
    
    
            // Scroll to the bottom to show the latest message
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        const stream = async (answer: Promise<AsyncGenerator<GenerateContentResponse, any, any>>, sender: "User" | "AI")=>{
            if (!messagesContainer) return;
    
            const messageEl:HTMLDivElement = messagesContainer.createDiv("chat-message");
            messageEl.addClass(sender === "User" ? "user-message" : "ai-message");

            // Message content - Rendered as Markdown
            const textContentEl = messageEl.createDiv({ cls: "chat-message-text" });
            MarkdownRenderer.render(this.app, "> [!danger] thinking...", textContentEl, this.getViewType(), this);
            let text = ""
            const response = await answer;
            for await (const chunk of response) {
                textContentEl.empty();
                if (chunk.text) {
                    text += chunk.text; 
                }
                MarkdownRenderer.render(this.app, text, textContentEl, this.getViewType(), this);
                if (chunk.functionCalls){await this.handler(chunk.functionCalls);
                }
              }
    
    
            // Scroll to the bottom to show the latest message
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            this.processing_message = false;
        }

        return {display, stream}

    }

    private async handleSendMessage(): Promise<void> {

          const config = {
            tools: toolsOnePass,
            responseMimeType: 'text/plain',
          };
        
        
        if (this.processing_message) return;
        this.processing_message = true;
        const messageText = this.inputEl.value.trim();

        
        if (messageText) {

            this.inputEl.value = "";
            this.inputEl.focus();
            this.inputEl.style.height = 'auto';

            const file = await (async ()=>{
                if (this.include_file) {
                    const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) {
                    new Notice('No active note');
                    return;
                }
                this.display("> [!faq] sending file:\n> "+activeFile.path, "AI");
                const item = await prepareFileData(activeFile);
                const signal = new AbortController().signal;
                const result = await upload_file(this.app, item, this.ai, signal);
                if (item.cloud_file) {
                    this.display("> [!danger] file received:\n> "+item.path, "AI");
                    return geminiFormatters.formatMedia(item.cloud_file);}
            }})()
        
            this.display(messageText, "User");
            const msg = file ? [file, messageText] : messageText;
            const answer = this.chat.sendMessageStream({message: msg, config: config});
            this.stream(answer, "AI");
            
        }
    }

    async onClose() {
        // Clean up any resources, event listeners if they weren't managed by Obsidian's lifecycle
        // For example, if you had global listeners or intervals.
        // DOM elements within `this.containerEl` are automatically cleaned up.
        console.log("ChatView closed");
    }
}