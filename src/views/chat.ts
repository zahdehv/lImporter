import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, Setting, Notice, App, TFile, SuggestModal } from "obsidian";
// Use GoogleGenerativeAI and ChatSession from @google/generative-ai
import {  Chat, FunctionCall, GenerateContentResponse, GoogleGenAI, Part } from "@google/genai"; 
import { createFunctionHandler, toolsOnePass } from "src/agents/onePass";
// Note: MarkdownView was imported but not used. Removed.
import lImporterPlugin from "src/main";
import { prepareFileData, upload_file } from "src/utils/files"; 
import { geminiFormatters } from "src/utils/messages";
import { bfsFileExpander } from "src/utils/graph";

/**
 * Unique identifier for the AI Chat View.
 */
export const CHAT_VIEW_TYPE = "ai-chat-view"; 

/**
 * Represents the AI Chat View within Obsidian.
 * This view allows users to interact with a generative AI model,
 * with capabilities including sending text messages and attaching files.
 */
export class ChatView extends ItemView {
    private plugin: lImporterPlugin;
    private inputEl: HTMLTextAreaElement; // Textarea for user input
    private ai: GoogleGenAI;       // Google AI SDK instance
    private chat: Chat;     
           // Active chat session with the AI model
    private maxDepth = 1;

    // Function responsible for handling AI function calls
    private handler: (functionCalls: FunctionCall[]) => Promise<Part[]>; 
    // Function to display messages in the chat UI
    private display: (text: string, sender: "User" | "AI")=> void;
    // Function to stream AI responses to the chat UI
    private stream: (answer: Promise<AsyncGenerator<GenerateContentResponse, any, any>>, sender: "User" | "AI") => Promise<void>;
    
    private processing_message: boolean = false; // Flag to prevent concurrent message sending

    private selectedFilesForChat: TFile[] = []; // Array of files selected to be sent with the next message
    private selectedFilesDisplayEl: HTMLDivElement; // HTMLElement to display the list of selected files

    constructor(leaf: WorkspaceLeaf, plugin: lImporterPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.icon = "bot-message-square"; // Icon for the view tab

        // Initialize the Google Generative AI client
        this.ai = new GoogleGenAI({apiKey: this.plugin.settings.GOOGLE_API_KEY}); 
        
        // Start a new chat session with the specified model and tools
        // TODO: Consider making the model name configurable via plugin settings
        this.chat = this.ai.chats.create({model: "gemini-2.5-flash-preview-05-20"}); 
    }

    getViewType(): string { return CHAT_VIEW_TYPE; }
    getDisplayText(): string { return "AI Chat"; } // Title for the view tab
    getIcon(): string { return "bot-message-square"; } // Icon for the view tab

    /**
     * Called when the view is first opened.
     * Responsible for setting up the UI elements of the chat view.
     */
    async onOpen() {
        const viewContent = this.containerEl.children[1]; // Standard content container for ItemView
        viewContent.empty(); // Clear previous content
        viewContent.addClass("chat-view-container"); // Add a class for styling

        viewContent.createEl("h4", { text: "AI Assistant" }); // View title

        // Setup display and streaming functions
        const fx = this.createSendingFunctions(viewContent);
        this.display = fx.display;
        this.stream = fx.stream;
        this.handler = createFunctionHandler(this.app, fx.display); // Function call handler

        // --- "Include active file" Toggle ---
        new Setting(viewContent as HTMLElement)
            .setName("Send file.")
            // .setDesc("Passes the active file to the chat.")
            .addSlider(slider=>slider
                .setValue(this.maxDepth)
                .setLimits(0, 23, 1)
                .onChange(value=>this.maxDepth = value)
            ).addButton(button=> button
                .setIcon('plus')
                .onClick(async ()=>{
                    const activeFile = this.app.workspace.getActiveFile();
                    if (!activeFile) {
                        new Notice('No active note');
                        return;
                    }
                    new Notice(activeFile.path);
                    this.selectedFilesForChat = await bfsFileExpander(this.plugin.app, activeFile,true, false,this.maxDepth);
                    this.updateSelectedFilesDisplay();
                })
            ).addButton(button=>button
                .setIcon('rotate-ccw')
                .onClick(()=>{
                    this.selectedFilesForChat = [];
                    this.updateSelectedFilesDisplay();
                })
            );

        // --- File Attachment Section ---
        const fileChatSection = viewContent.createDiv({cls: "chat-file-section"});

        // Display area for selected files
        this.selectedFilesDisplayEl = fileChatSection.createDiv("selected-files-display");
        this.updateSelectedFilesDisplay(); // Initialize display

        // --- Input Area (Textarea and Send Button) ---
        const inputArea = viewContent.createDiv("chat-input-area");
        this.inputEl = inputArea.createEl("textarea", {
            attr: { placeholder: "Type your message... (Shift+Enter for new line)" },
            cls: "chat-input-textarea"
        });
        const sendButton = inputArea.createEl("button", {
            text: "Send",
            cls: "limporter-button primary" // Style as a primary button
        });
        setIcon(sendButton, "corner-down-left"); // Set icon for send button

        // Event listener for the send button
        sendButton.onClickEvent(() => this.handleSendMessage());
        
        // Event listener for Enter key in textarea (Shift+Enter for new line)
        this.inputEl.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Prevent new line
                await this.handleSendMessage();
            }
        });

    }

    /**
     * Updates the display area for selected files.
     * Clears and re-renders the list of files currently selected for chat.
     * @private
     */
    private updateSelectedFilesDisplay(): void {
        if (!this.selectedFilesDisplayEl) return; // Guard against null element

        this.selectedFilesDisplayEl.empty(); // Clear current display
        if (this.selectedFilesForChat.length === 0) {
            this.selectedFilesDisplayEl.setText("No files attached for the next message.");
            this.selectedFilesDisplayEl.addClass("empty-selected-files-display");
            return;
        }
        this.selectedFilesDisplayEl.removeClass("empty-selected-files-display");

        // Create a list to display selected file names with remove buttons
        const listEl = this.selectedFilesDisplayEl.createEl("ul", { cls: "chat-selected-files-list"});
        this.selectedFilesForChat.forEach(file => {
            const itemEl = listEl.createEl("li", { cls: "chat-selected-file-item" });
            const fileNameEl = itemEl.createSpan({text: file.name});
            fileNameEl.addClass("selected-file-name");
            
            // Add a small button to remove the file from the selection
            const removeButton = itemEl.createEl("button", {cls: "limporter-button-sm"});
            setIcon(removeButton, "x-circle");
            removeButton.style.marginLeft = "8px"; // Add some spacing
            removeButton.onClickEvent((evt) => {
                evt.stopPropagation(); // Prevent click from propagating
                this.removeFileFromChat(file);
            });
        });
    }

    /**
     * Removes a specified file from the `selectedFilesForChat` array.
     * @param fileToRemove - The TFile to remove from the selection.
     * @private
     */
    private removeFileFromChat(fileToRemove: TFile): void {
        this.selectedFilesForChat = this.selectedFilesForChat.filter(
            file => file.path !== fileToRemove.path
        );
        this.updateSelectedFilesDisplay(); // Update UI
    }
    
    /**
     * Handles the process of sending a message to the AI.
     * This includes preparing text and any attached files,
     * sending them to the AI model, and displaying the response.
     * @private
     */
    private async handleSendMessage(): Promise<void> {
        if (this.processing_message) return; // Prevent concurrent sends
        const messageText = this.inputEl.value.trim();

        // Ensure there's something to send (text or files)
        if (!messageText && this.selectedFilesForChat.length === 0) {
            new Notice("Please type a message");
            return;
        }
        this.processing_message = true; // Set processing flag
        
        // Clear input field and reset its height
        this.inputEl.value = ""; 
        this.inputEl.focus();
        this.inputEl.style.height = 'auto';

        const currentMessageContent: (Part | string)[] = []; 
        const filesToProcess: TFile[] = []; // Consolidate all files to be processed

        // Add files explicitly attached via the "Attach File" button
        this.selectedFilesForChat.forEach(file => {
            // Avoid duplicates if active file is also in selectedFilesForChat
            if (!filesToProcess.some(f => f.path === file.path)) {
                filesToProcess.push(file);
            }
        });

        // --- File Processing and Uploading ---
        if (filesToProcess.length > 0) {
            this.display(`> [!faq] Preparing ${filesToProcess.length} file(s)...`, "AI");
            for (const file of filesToProcess) {
                let item = await prepareFileData(file); 
                const signal = new AbortController().signal; // For potential cancellation (not fully used yet)
                try {
                    // Upload the file using the utility function
                    const uploadedFileProto = 
                        await upload_file(this.app, item, this.ai, signal); 
                    
                    // If upload is successful and URI/MIME type are present, format for Gemini
                    if (uploadedFileProto && uploadedFileProto.uri && uploadedFileProto.mimeType) {
                        currentMessageContent.push(geminiFormatters.formatMedia(
                            // Cast to the simpler structure geminiFormatters.formatMedia expects
                            { uri: uploadedFileProto.uri, mimeType: uploadedFileProto.mimeType }
                        ));
                        this.display(`> [!info] File included: ${item.path}`, "AI");
                    } else {
                         this.display(`> [!danger] File upload failed or URI/MIME type missing for: ${item.path}`, "AI");
                    }
                } catch (error: any) {
                    console.error("Error uploading file:", item.path, error);
                    this.display(`> [!danger] Error uploading file: ${item.path} (${error.message || JSON.stringify(error)})`, "AI");
                }
            }
        }
        
        // Add user's text message if provided
        if (messageText) {
            this.display(messageText, "User"); 
            currentMessageContent.push(messageText);
        }
        
        // If no content (text or successfully processed files), abort sending
        if (currentMessageContent.length === 0) {
            new Notice("Nothing to send. File preparation might have failed or no text entered.");
            this.processing_message = false; // Reset flag
            return;
        }
        
        // --- Send to AI and Stream Response ---
        const answer = this.chat.sendMessageStream({message: currentMessageContent});
        this.stream(answer, "AI"); // Handle streaming display

        // Clear selected files after sending
        this.selectedFilesForChat = []; 
        this.updateSelectedFilesDisplay(); // Update UI
    }

    /**
     * Creates and returns functions for displaying messages and streaming AI responses.
     * @param element - The parent HTMLElement where messages will be displayed.
     * @returns An object containing `display` and `stream` functions.
     * @private
     */
    private createSendingFunctions(element: Element){
        // Container for all chat messages
        const messagesContainer = element.createDiv("chat-messages-container");
        messagesContainer.id = `${CHAT_VIEW_TYPE}-messages-display`; 
        
        /** Displays a single message in the chat UI. */
        const display = (text: string, sender: "User" | "AI") => {
            const messageEl = messagesContainer.createDiv("chat-message");
            messageEl.addClass(sender === "User" ? "user-message" : "ai-message");
            const textContentEl = messageEl.createDiv({ cls: "chat-message-text" });
            // Render message content as Markdown
            MarkdownRenderer.render(this.app, text, textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
            messagesContainer.scrollTop = messagesContainer.scrollHeight; // Auto-scroll
        };

        /** Handles streaming of AI responses. */
        const stream = async (answer: Promise<AsyncGenerator<GenerateContentResponse, any, any>>, sender: "User" | "AI")=>{
            const messageEl = messagesContainer.createDiv("chat-message"); // Create element for AI's response
            messageEl.addClass(sender === "User" ? "user-message" : "ai-message");
            const textContentEl = messageEl.createDiv({ cls: "chat-message-text" });
            // Initial "thinking" message
            MarkdownRenderer.render(this.app, "> [!info] AI is thinking...", textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
            let fullText = ""; // Accumulate streamed text
            
            try {
                const responseGenerator = await answer;
                for await (const chunk of responseGenerator) {
                    textContentEl.empty(); // Clear previous chunk/thinking message
                    const chunkText = chunk.text; 
                    if (chunkText) {
                        fullText += chunkText; 
                    }
                    // Display current full text with a streaming cursor "▌"
                    MarkdownRenderer.render(this.app, fullText + " ▌", textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
                    
                    const functionCalls = chunk.functionCalls; 
                    if (functionCalls && functionCalls.length > 0){ 
                        // Handle AI function calls if any
                        await this.handler(functionCalls); 
                        // Re-render text without cursor after function call, as AI might send more text or end.
                        textContentEl.empty(); 
                        MarkdownRenderer.render(this.app, fullText, textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
                    }
                }
                // Final render of the full text without the cursor
                textContentEl.empty();
                MarkdownRenderer.render(this.app, fullText, textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);

            } catch (error: any) {
                console.error("Streaming error:", error);
                textContentEl.empty();
                MarkdownRenderer.render(this.app, "> [!danger] Error receiving AI response: " + error.message, textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
            } finally {
                 messagesContainer.scrollTop = messagesContainer.scrollHeight; // Ensure scrolled to bottom
                 this.processing_message = false; // Reset processing flag
            }
        };
        return {display, stream};
    }

    /**
     * Called when the view is being closed.
     * Can be used for cleanup or saving state.
     */
    async onClose() {
        console.log(`ChatView closed.`);
        // Example: Persist chat history to plugin settings if desired
        // this.plugin.settings.chatHistory = await this.chat.getHistory(); // Assuming getHistory() is async and returns serializable data
        // await this.plugin.saveSettings();
    }
}