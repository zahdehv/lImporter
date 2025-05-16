import { FuzzySuggestModal, TFile, App } from "obsidian";

export class FileSuggestionModal extends FuzzySuggestModal<TFile> {
    private didSubmit: boolean = false; 

    constructor(
        app: App,
        private validExtensions: string[], // This will receive all supported extensions
        private callback: (file: TFile | null) => void
    ) {
        super(app);
    }

    getItems(): TFile[] {
        return this.app.vault.getFiles().filter(file =>
            this.validExtensions.includes(file.extension.toLowerCase())
        );
    }

    getItemText(file: TFile): string {
        return file.name;
    }

    onChooseItem(file: TFile): void {
        this.didSubmit = true; 
        this.callback(file);
    }

    onClose(): void {
        if (!this.didSubmit) { 
            this.callback(null);
        }
    }
}