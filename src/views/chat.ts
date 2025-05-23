import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, Setting, Notice, App, TFile, SuggestModal } from "obsidian";
import { GoogleGenerativeAI, ChatSession, FunctionCall, GenerateContentResponse, Part, HarmCategory, HarmBlockThreshold, Tool, FunctionDeclaration } from "@google/genai"; 

import { createFunctionHandler, toolsOnePass } from "src/agents/onePass"; 
import lImporterPlugin from "src/main";
import { prepareFileData, upload_file, PreparedFilePart } from "src/utils/files"; 
import { geminiFormatters } from "src/utils/messages"; 

export const CHAT_VIEW_TYPE = "ai-chat-view"; 

class FileSuggestModal extends SuggestModal<TFile> {
    constructor(app: App, private onChoose: (file: TFile) => void) {
        super(app);
        this.setPlaceholder("Select a file to add to chat...");
    }

    getSuggestions(query: string): TFile[] {
        return this.app.vault.getFiles().filter(file => 
            file.path.toLowerCase().includes(query.toLowerCase())
        );
    }

    renderSuggestion(file: TFile, el: HTMLElement) {
        el.setText(file.path);
    }

    onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.onChoose(file);
    }
}

export class ChatView extends ItemView {
    private plugin: lImporterPlugin;
    private inputEl: HTMLTextAreaElement;
    private ai: GoogleGenerativeAI;
    private chat: ChatSession; 
    private include_file: boolean = false;
    private handler: (functionCalls: FunctionCall[]) => Promise<Part[]>; 
    private display: (text: string, sender: "User" | "AI")=> void;
    private stream: (answer: Promise<AsyncGenerator<GenerateContentResponse, any, any>>, sender: "User" | "AI") => Promise<void>;
    private processing_message: boolean = false;
    
    private selectedFilesForChat: TFile[] = [];
    private selectedFilesDisplayEl: HTMLDivElement;

    constructor(leaf: WorkspaceLeaf, plugin: lImporterPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.icon = "bot-message-square";
        this.ai = new GoogleGenerativeAI(this.plugin.settings.GOOGLE_API_KEY);
        
        const toolDeclarations: FunctionDeclaration[] = toolsOnePass.reduce((acc: FunctionDeclaration[], tool: Tool) => {
            if (tool.functionDeclarations) {
                acc.push(...tool.functionDeclarations);
            }
            return acc;
        }, []);

        const toolsForModel: Tool[] = toolDeclarations.length > 0 ? [{ functionDeclarations: toolDeclarations }] : [];

        const model = this.ai.getGenerativeModel({ 
            model: "gemini-1.0-pro-latest", 
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ],
            tools: toolsForModel,
        });
        this.chat = model.startChat({
            history: [], 
        });
    }

    getViewType(): string { return CHAT_VIEW_TYPE; }
    getDisplayText(): string { return "AI Chat"; }
    getIcon(): string { return "bot-message-square"; }

    async onOpen() {
        const viewContent = this.containerEl.children[1];
        viewContent.empty();
        viewContent.addClass("chat-view-container");
        viewContent.createEl("h4", { text: "AI Assistant" });

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

        const fileChatSection = viewContent.createDiv({cls: "chat-file-section"});
        const addFileButtonContainer = fileChatSection.createDiv({ cls: "chat-add-file-container" });
        const addFileButton = addFileButtonContainer.createEl("button", { 
            text: "Attach File", 
            cls: "limporter-button" 
        });
        setIcon(addFileButton, "paperclip");
        addFileButton.onClickEvent(() => this.promptAndAddFileToChat());

        this.selectedFilesDisplayEl = fileChatSection.createDiv("selected-files-display");
        this.updateSelectedFilesDisplay();

        const inputArea = viewContent.createDiv("chat-input-area");
        this.inputEl = inputArea.createEl("textarea", {
            attr: { placeholder: "Type your message... (Shift+Enter for new line)" },
            cls: "chat-input-textarea"
        });
        const sendButton = inputArea.createEl("button", {
            text: "Send",
            cls: "limporter-button primary"
        });
        setIcon(sendButton, "corner-down-left");
        sendButton.onClickEvent(() => this.handleSendMessage());
        this.inputEl.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                await this.handleSendMessage();
            }
        });
        
        try {
            const history = await this.chat.getHistory(); 
            if (history && history.length > 0) {
                this.display("Restoring previous session...", "AI");
                for (const message of history) {
                    const textContent = message.parts.map(part => part.text || "").join(" ");
                    this.display(textContent, message.role === "user" ? "User" : "AI");
                }
            } else {
                this.display("Hello! How can I assist you today?", "AI");
            }
        } catch(e) {
            console.warn("Could not get chat history or chat is new:", e);
            this.display("Hello! How can I assist you today?", "AI");
        }
    }

    private updateSelectedFilesDisplay(): void {
        if (!this.selectedFilesDisplayEl) return;
        this.selectedFilesDisplayEl.empty();
        if (this.selectedFilesForChat.length === 0) {
            this.selectedFilesDisplayEl.setText("No files attached for the next message.");
            this.selectedFilesDisplayEl.addClass("empty-selected-files-display");
            return;
        }
        this.selectedFilesDisplayEl.removeClass("empty-selected-files-display");
        const listEl = this.selectedFilesDisplayEl.createEl("ul", { cls: "chat-selected-files-list"});
        this.selectedFilesForChat.forEach(file => {
            const itemEl = listEl.createEl("li", { cls: "chat-selected-file-item" });
            const fileNameEl = itemEl.createSpan({text: file.name});
            fileNameEl.addClass("selected-file-name");
            const removeButton = itemEl.createEl("button", {cls: "limporter-button-sm"});
            setIcon(removeButton, "x-circle");
            removeButton.style.marginLeft = "8px";
            removeButton.onClickEvent((evt) => {
                evt.stopPropagation();
                this.removeFileFromChat(file);
            });
        });
    }

    private async promptAndAddFileToChat(): Promise<void> {
        new FileSuggestModal(this.app, (selectedFile) => {
            if (!this.selectedFilesForChat.some(f => f.path === selectedFile.path)) {
                this.selectedFilesForChat.push(selectedFile);
                this.updateSelectedFilesDisplay();
            } else {
                new Notice("File already added.");
            }
        }).open();
    }

    private removeFileFromChat(fileToRemove: TFile): void {
        this.selectedFilesForChat = this.selectedFilesForChat.filter(
            file => file.path !== fileToRemove.path
        );
        this.updateSelectedFilesDisplay();
    }
    
    private async handleSendMessage(): Promise<void> {
        if (this.processing_message) return;
        const messageText = this.inputEl.value.trim();

        if (!messageText && this.selectedFilesForChat.length === 0 && !this.include_file) {
            new Notice("Please type a message or add/select a file.");
            return;
        }
        this.processing_message = true;
        
        this.inputEl.value = ""; 
        this.inputEl.focus();
        this.inputEl.style.height = 'auto';

        const messageParts: Part[] = []; 
        const filesToProcess: TFile[] = [];

        if (this.include_file) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) filesToProcess.push(activeFile);
            else new Notice('"Include active file" is on, but no file is active.');
        }

        this.selectedFilesForChat.forEach(file => {
            if (!filesToProcess.some(f => f.path === file.path)) filesToProcess.push(file);
        });

        if (filesToProcess.length > 0) {
            this.display("> [!faq] Preparing " + filesToProcess.length + " file(s)...", "AI");
            for (const file of filesToProcess) {
                let item: PreparedFilePart = await prepareFileData(file, this.app); 
                const signal = new AbortController().signal;
                try {
                    const uploadedFile = await upload_file(this.app, item, this.ai, signal); 
                    
                    if (uploadedFile && uploadedFile.uri && uploadedFile.mimeType) {
                        messageParts.push(geminiFormatters.formatMedia(uploadedFile)); 
                        this.display("> [!info] File included: " + item.path, "AI");
                    } else {
                         this.display("> [!danger] File upload failed or URI/MIME type missing for: " + item.path, "AI");
                    }
                } catch (error: any) {
                    console.error("Error uploading file:", item.path, error);
                    this.display("> [!danger] Error uploading file: " + item.path + ` (${error.message || JSON.stringify(error)})`, "AI");
                }
            }
        }
        
        if (messageText) {
            this.display(messageText, "User"); 
            messageParts.push({ text: messageText }); 
        }
        
        if (messageParts.length === 0) {
            new Notice("Nothing to send. File preparation might have failed or no text entered.");
            this.processing_message = false;
            return;
        }
        
        const answer = this.chat.sendMessageStream(messageParts); 
        this.stream(answer, "AI"); 

        this.selectedFilesForChat = []; 
        this.updateSelectedFilesDisplay();
    }

    private createSendingFunctions(element: Element){
        const messagesContainer = element.createDiv("chat-messages-container");
        messagesContainer.id = `${CHAT_VIEW_TYPE}-messages-display`; 
        const display = (text: string, sender: "User" | "AI") => {
            const messageEl = messagesContainer.createDiv("chat-message");
            messageEl.addClass(sender === "User" ? "user-message" : "ai-message");
            const textContentEl = messageEl.createDiv({ cls: "chat-message-text" });
            MarkdownRenderer.render(this.app, text, textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        };

        const stream = async (answer: Promise<AsyncGenerator<GenerateContentResponse, any, any>>, sender: "User" | "AI")=>{
            const messageEl:HTMLDivElement = messagesContainer.createDiv("chat-message");
            messageEl.addClass(sender === "User" ? "user-message" : "ai-message");
            const textContentEl = messageEl.createDiv({ cls: "chat-message-text" });
            MarkdownRenderer.render(this.app, "> [!info] AI is thinking...", textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
            let fullText = "";
            try {
                const responseGenerator = await answer;
                for await (const chunk of responseGenerator) {
                    textContentEl.empty(); 
                    const chunkText = chunk.text(); 
                    if (chunkText) {
                        fullText += chunkText; 
                    }
                    MarkdownRenderer.render(this.app, fullText + " ▌", textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
                    
                    const functionCalls = chunk.functionCalls; 
                    if (functionCalls && functionCalls.length > 0){ 
                        await this.handler(functionCalls); 
                        textContentEl.empty(); 
                        MarkdownRenderer.render(this.app, fullText, textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
                    }
                }
                textContentEl.empty();
                MarkdownRenderer.render(this.app, fullText, textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);

            } catch (error: any) {
                console.error("Streaming error:", error);
                textContentEl.empty();
                const errorMessage = error.message ? error.message : JSON.stringify(error);
                MarkdownRenderer.render(this.app, "> [!danger] Error receiving AI response: " + errorMessage, textContentEl, this.getViewType() || CHAT_VIEW_TYPE, this);
            } finally {
                 messagesContainer.scrollTop = messagesContainer.scrollHeight;
                 this.processing_message = false; 
            }
        };
        return {display, stream};
    }

    async onClose() {
        console.log("ChatView closed.");
    }
}