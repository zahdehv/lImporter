import { Chat, GoogleGenAI } from "@google/genai";
import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer } from "obsidian";
import AutoFilePlugin from "src/main";

// Unique identifier for this view type
export const CHAT_VIEW_TYPE = "ai-chat-view";

// Basic styling will be applied via classes.
// For more advanced styling, you would typically add a styles.css file to your plugin
// and load it using this.registerStyles('styles.css'); in your plugin's onload.
// Example CSS classes used:
// .chat-view-container - Main container for the view
// .chat-messages-container - Scrollable area for messages
// .chat-message - Individual message bubble
// .user-message - Message from the user
// .ai-message - Message from the AI
// .chat-message-sender - Span for the sender's name
// .chat-message-text - Span for the message content
// .chat-input-area - Container for the text input and send button
// .chat-input-textarea - The textarea for typing messages
// .chat-send-button - The send button

export class ChatView extends ItemView {
    private plugin: AutoFilePlugin;
    
    private messagesContainer: HTMLElement;
    private inputEl: HTMLTextAreaElement;
    
    private ai: GoogleGenAI;
    private chat: Chat;
    
    // private sendButton: HTMLButtonElement; // Reference not strictly needed if only event is attached

    constructor(leaf: WorkspaceLeaf, plugin: AutoFilePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.icon = "messages-square"; // Set the icon for the view tab
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
        return "messages-square"; // Icon for the view if it's not set in constructor or needs to be dynamic
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
        this.messagesContainer = viewContent.createDiv("chat-messages-container");
        this.messagesContainer.id = `${CHAT_VIEW_TYPE}-messages-display`; // Unique ID

        // Input area
        const inputArea = viewContent.createDiv("chat-input-area");
        this.inputEl = inputArea.createEl("textarea", {
            attr: { placeholder: "Type your message... (Shift+Enter for new line)" },
            cls: "chat-input-textarea"
        });

        const sendButton = inputArea.createEl("button", {
            text: "Send",
            cls: "chat-send-button" // "mod-cta" for primary action styling
        });
        setIcon(sendButton, "send");

        // Event listeners
        sendButton.onClickEvent(this.handleSendMessage.bind(this));

        this.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Prevent default Enter behavior (new line in textarea)
                this.handleSendMessage();
            }
        });

        // Initial welcome message (optional)
        this.displayMessage("Hello! How can I assist you today?", "AI");
    }

    private handleSendMessage(): void {
        const messageText = this.inputEl.value.trim();
        if (messageText) {
            this.displayMessage(messageText, "User");
            
            // --- TODO: Integrate with your AI backend here ---
            // For example, make an API call, then display the response:
            // const aiResponse = await this.getAiResponse(messageText);
            // this.displayMessage(aiResponse, "AI");
            
            // Simulated AI response for demonstration
            setTimeout(() => {
                this.displayMessage(`I received: "${messageText}". I'm a simulated AI, so I can't process this yet.`, "AI");
            }, 1000);

            this.inputEl.value = ""; // Clear input
            this.inputEl.focus();
            this.inputEl.style.height = 'auto'; // Reset height for next input
        }
    }

    private displayMessage(text: string, sender: "User" | "AI"): void {
        if (!this.messagesContainer) return;

        const messageEl = this.messagesContainer.createDiv("chat-message");
        messageEl.addClass(sender === "User" ? "user-message" : "ai-message");

        // Sender label (optional, could be part of styling)
        // messageEl.createSpan({ cls: "chat-message-sender", text: `${sender}:` });
        
        // Message content - Rendered as Markdown
        const textContentEl = messageEl.createDiv({ cls: "chat-message-text" });
        MarkdownRenderer.render(this.app, text, textContentEl, this.getViewType(), this);


        // Scroll to the bottom to show the latest message
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async onClose() {
        // Clean up any resources, event listeners if they weren't managed by Obsidian's lifecycle
        // For example, if you had global listeners or intervals.
        // DOM elements within `this.containerEl` are automatically cleaned up.
        console.log("ChatView closed");
    }
}