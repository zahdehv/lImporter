import { App, Modal, MarkdownRenderer, Component } from 'obsidian';
import lImporterPlugin from 'src/main';

// Define the structure of the object our modal will resolve with
export interface FeedbackModalResult {
    accepted: boolean;
    feedback: string;
}

export class FeedbackModal extends Modal {
    private markdownContent: string;
    private resolvePromise: (value: FeedbackModalResult) => void;
    private rejectPromise: (reason?: any) => void; // Though we'll usually resolve
    private feedbackText: string = '';
    private didSubmit: boolean = false; // To track if a button was clicked vs. modal closed via Esc/X

    private textareaEl: HTMLTextAreaElement;

    private plugin: lImporterPlugin;
    constructor(app: App, markdownContent: string, plugin: lImporterPlugin) {
        super(app);
        this.markdownContent = markdownContent;
        this.plugin = plugin;
    }

    // Public method to open the modal and get a promise
    public waitForUserInput(): Promise<FeedbackModalResult> {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject; // In case of unexpected errors, though we aim to resolve
            this.open(); // This will call onOpen internally
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty(); // Clear previous content if any

        contentEl.addClass('feedback-modal-content'); // For potential custom styling

        // 1. Render Markdown at the top
        const markdownContainer = contentEl.createDiv({ cls: 'feedback-modal-markdown' });
        // The last argument to renderMarkdown is a Component. The Modal itself is a Component.
        // If your markdown has links or embeds that need a source path, you'd provide it as the 3rd arg.
        MarkdownRenderer.render(this.app, this.markdownContent, markdownContainer, '', this.plugin);

        // 2. Textarea below it
        this.textareaEl = contentEl.createEl('textarea', {
            attr: {
                rows: 5,
                placeholder: 'Enter your feedback here (optional)...'
            }
        });
        this.textareaEl.addClass('feedback-modal-textarea');
        this.textareaEl.value = this.feedbackText; // Restore if re-opened, though unlikely with promise pattern
        this.textareaEl.addEventListener('input', (e) => {
            this.feedbackText = (e.target as HTMLTextAreaElement).value;
        });

        // 3. Accept and Reject buttons
        const buttonContainer = contentEl.createDiv({ cls: 'feedback-modal-buttons' });

        const rejectButton = buttonContainer.createEl('button', { text: 'Reject' });
        rejectButton.addEventListener('click', () => {
            this.didSubmit = true;
            this.resolvePromise({
                accepted: false,
                feedback: this.textareaEl.value.trim()
            });
            this.close();
        });

        const acceptButton = buttonContainer.createEl('button', { text: 'Accept', cls: 'mod-cta' }); // mod-cta for primary action
        acceptButton.addEventListener('click', () => {
            this.didSubmit = true;
            this.resolvePromise({
                accepted: true,
                feedback: this.textareaEl.value.trim()
            });
            this.close();
        });

        // Focus the textarea when the modal opens
        setTimeout(() => this.textareaEl.focus(), 50);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();

        // If the modal was closed without clicking Accept/Reject (e.g., Esc key, 'X' button)
        // and the promise hasn't been resolved yet.
        if (!this.didSubmit && this.resolvePromise) {
            this.resolvePromise({
                accepted: false, // Default to rejected or a specific "cancelled" state
                feedback: this.textareaEl?.value?.trim() || '' // Still provide feedback if any was typed
            });
        }
    }
}

export async function askModal(plugin: lImporterPlugin, title: string, question: string) {
    const text = "## " + title + "\n" + question;
    const modal = new FeedbackModal(plugin.app, text, plugin);
    return await modal.waitForUserInput();
}