import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, Setting, Notice, TFile } from "obsidian";
import { GoogleGenAI } from "@google/genai";
import lImporterPlugin from "src/main";
import { FileItem, prepareFileData, FileSuggestionModal } from "src/utils/files";
import { agentList } from "src/agents/agen";
import { createProcessTracker } from "src/utils/tracker";

/**
 * Unique identifier for the AI Chat View.
 */
export const LIMPORTER_VIEW_TYPE = "ai-chat-view";

/**
 * Represents the AI Chat View within Obsidian.
 * This view allows users to interact with a generative AI model,
 * with capabilities including sending text messages and attaching files.
 */
export class ChatView extends ItemView {
    private plugin: lImporterPlugin;
    private inputEl: HTMLTextAreaElement; // Textarea for user input

    private selectedFilesForChat: FileItem[] = []; // Array of files selected to be sent with the next message

    private createMessage: (sender: "User" | "AI") => {
        messageEl: HTMLDivElement;
        MD: (text: string) => void;
    };
    private processing_message: boolean = false; // Flag to prevent concurrent message sending
    private sendButton: HTMLButtonElement;

    private currentPipeline: (files: FileItem[], additionalPrompt?: string) => Promise<void> | null;

    constructor(leaf: WorkspaceLeaf, plugin: lImporterPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.icon = "bot-message-square"; // Icon for the view tab
    }

    getViewType(): string { return LIMPORTER_VIEW_TYPE; }
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

        // viewContent.createEl("h4", { text: "AI Assistant" }); // View title

        // Setup display and streaming functions
        this.createMessage = this.createMessageHandle(viewContent);

        const filesContainerEl = this.containerEl.querySelector('.limporter-files-container') as HTMLElement;
        if (filesContainerEl) {
            this.renderFileItems(filesContainerEl);
        }

        // --- Input Area (Textarea and Send Button) ---
        const inputArea = viewContent.createDiv("chat-input-area");

        const filesContainer = inputArea.createDiv('limporter-files-container');
        filesContainer.style.display = 'flex';
        this.renderFileItems(filesContainer);

        new Setting(inputArea).addDropdown(dropdown => {
            dropdown
                .addOptions(Object.fromEntries(agentList.map(opt => [opt.id, opt.name])))
                .onChange(async (value) => {
                    if (value) {
                        const selected = agentList.find(opt => opt.id === value);
                        if (selected) {
                            this.currentPipeline = selected.buildAgent(this.plugin);
                            new Notice(`Loaded agent`);
                        }
                    }
                });
        });

        this.sendButton = inputArea.createEl("button", {
            text: "Send",
            cls: "limporter-button primary" // Style as a primary button
        });
        setIcon(this.sendButton, "corner-down-left"); // Set icon for send button

        this.inputEl = inputArea.createEl("textarea", {
            attr: { placeholder: "Type your message... (Shift+Enter for new line)" },
            cls: "chat-input-textarea"
        });
        this.inputEl.toggleVisibility(false);
        this.inputEl.style.height = '0px';

        // Event listener for the send button
        this.sendButton.onClickEvent(() => this.handleSendMessage());

        // Event listener for Enter key in textarea (Shift+Enter for new line)
        this.inputEl.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Prevent new line
                await this.handleSendMessage();
            }
        });

        this.currentPipeline = agentList[0].buildAgent(this.plugin);
        new Notice("Loaded default agent");
    }

    async addFile(file: TFile) {
        const newFileItem = await prepareFileData(file);
        this.selectedFilesForChat.push(newFileItem);
        const filesContainerEl = this.containerEl.querySelector('.limporter-files-container') as HTMLElement;
        if (filesContainerEl) {
            this.renderFileItems(filesContainerEl);
        }
    }

    private renderFileItems(container: HTMLElement): void {
        container.empty();
        this.selectedFilesForChat.forEach((fileItem, index) => {
            const fileEl = container.createDiv('limporter-file-item');
            fileEl.dataset.index = index.toString();
            const fileInfoEl = fileEl.createDiv('limporter-file-info');
            const iconEl = fileInfoEl.createDiv('limporter-file-icon');
            setIcon(iconEl, (fileItem.mimeType.includes('pdf') || fileItem.mimeType.includes('markdown')) ? 'file-text' : 'file-audio');
            const fileDetailsEl = fileInfoEl.createDiv('limporter-file-details');
            fileDetailsEl.createEl('div', { cls: 'limporter-file-name', text: fileItem.title });
            // Improved file type display
            // let fileTypeDescription = 'File';
            // if (fileItem.mimeType.startsWith('audio/')) {
            //     fileTypeDescription = 'Audio File';
            // } else if (fileItem.mimeType === 'application/pdf') {
            //     fileTypeDescription = 'PDF Document';
            // } else if (fileItem.mimeType === 'text/markdown') {
            //     fileTypeDescription = 'Markdown Document';
            // }
            // fileDetailsEl.createEl('div', { cls: 'limporter-file-type', text: fileTypeDescription });

            if (!fileItem.mimeType.includes('pdf') && !fileItem.mimeType.includes('markdown')) {
                fileEl.createEl('audio', { attr: { controls: 'true', src: URL.createObjectURL(fileItem.blob), class: 'limporter-audio-player' } });
            }
            const actionContainer = fileInfoEl.createDiv('limporter-action-container');
            const trashIcon = actionContainer.createDiv('limporter-trash-icon');
            setIcon(trashIcon, 'trash-2');
            trashIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(fileEl.dataset.index || '0');
                this.selectedFilesForChat.splice(idx, 1);
                this.renderFileItems(container);
            });
        });
        this.createAddButton(container);
    }

    private createAddButton(container: HTMLElement): void {
        const button = container.createEl('button', {
            cls: 'limporter-button secondary',
        });
        setIcon(button, 'plus');
        button.style.marginTop = "0.5rem";
        button.addEventListener('click', () => {
            new FileSuggestionModal(this.app, this.plugin.getAllSupportedExtensions(), async (file) => { // Uses plugin.getAllSupportedExtensions() which will be updated
                if (file) {
                    await this.addFile(file);
                }
            }).open();
        });
    }

    private async handleSendMessage(): Promise<void> {
        try {
            if (this.processing_message) {
                this.plugin.tracker.abortController?.abort();
                this.sendButton.disabled = true;
                return;
            }

            this.sendButton.addClass('stop-mode');
            setIcon(this.sendButton, 'stop-circle')

            const messageText = this.inputEl.value.trim();

            if (!messageText && this.selectedFilesForChat.length === 0) {
                new Notice("Please type a message or add files");
                return;
            }
            this.processing_message = true; // Set processing flag

            this.inputEl.value = "";
            this.inputEl.focus();
            this.inputEl.style.height = '0rem';

            this.plugin.tracker = createProcessTracker(this.plugin, this.createMessage);

            if (!this.currentPipeline) throw new Error('No pipeline selected');
            await this.currentPipeline(this.selectedFilesForChat, messageText);

        } catch (error: any) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(errorMsg);
            this.plugin.tracker.setInProgressStepsToError(errorMsg);
        } finally {
            this.sendButton.removeClass('stop-mode');
            setIcon(this.sendButton, 'corner-down-left')
            this.sendButton.disabled = false;
            this.processing_message = false;
        }

    }

    private createMessageHandle(element: Element) {
        const messagesContainer = element.createDiv("chat-messages-container");
        messagesContainer.id = `${LIMPORTER_VIEW_TYPE}-messages-display`;

        const createMessage = (sender: "User" | "AI") => {
            const messageEl = messagesContainer.createDiv("chat-message");
            messageEl.addClass(sender === "User" ? "user-message" : "ai-message");
            const MD = (text: string) => {
                messageEl.empty();
                const textContentEl = messageEl.createDiv({ cls: "chat-message-text" });

                MarkdownRenderer.render(this.app, text, textContentEl, this.getViewType() || LIMPORTER_VIEW_TYPE, this);
            }
            return { messageEl, MD };
        }
        return createMessage;
    }

    async onClose() {
        console.debug(`View closed.`);
    }
}