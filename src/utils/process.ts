import { TFile, Component, App, WorkspaceLeaf, Notice } from "obsidian";

export class InteractiveProcessNotifier {
    private noticeEl: HTMLElement;
    private processEl: HTMLElement;
    private filesEl: HTMLElement;
    private graphLeaf: WorkspaceLeaf | null = null;
    private isExpanded = false;

    constructor(private app: App) {
        this.showNotice();
    }

    private showNotice() {
        const fragment = document.createDocumentFragment();
        const wrapper = document.createElement('div');
        this.noticeEl = wrapper;
        wrapper.className = 'interactive-notice';
        fragment.appendChild(wrapper);
        
        // Header with collapse/expand button
        const header = document.createElement('div');
        header.className = 'notice-header';
        
        const title = document.createElement('strong');
        title.textContent = 'Process Tracker';
        header.appendChild(title);
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'notice-toggle';
        toggleBtn.textContent = this.isExpanded ? '▲ Collapse' : '▼ Expand';
        
        toggleBtn.onclick = () => {
            this.isExpanded = !this.isExpanded;
            toggleBtn.textContent = this.isExpanded ? '▲ Collapse' : '▼ Expand';
            if (this.processEl) this.processEl.style.display = this.isExpanded ? 'block' : 'none';
            if (this.filesEl) this.filesEl.style.display = this.isExpanded ? 'block' : 'none';
        };
        
        header.appendChild(toggleBtn);
        wrapper.appendChild(header);

        // Process section
        this.processEl = document.createElement('div');
        this.processEl.className = 'notice-process';
        this.processEl.style.display = 'none';
        
        const processTitle = document.createElement('h5');
        processTitle.textContent = 'Steps';
        this.processEl.appendChild(processTitle);
        
        const processItems = document.createElement('div');
        processItems.className = 'process-items';
        this.processEl.appendChild(processItems);
        wrapper.appendChild(this.processEl);

        // Files section
        this.filesEl = document.createElement('div');
        this.filesEl.className = 'notice-files';
        this.filesEl.style.display = 'none';
        
        const filesTitle = document.createElement('h5');
        filesTitle.textContent = 'Files';
        this.filesEl.appendChild(filesTitle);
        
        const fileItems = document.createElement('div');
        fileItems.className = 'file-items';
        this.filesEl.appendChild(fileItems);
        wrapper.appendChild(this.filesEl);

        // Show notice
        new Notice(fragment, 0);
    }

    public addStep(message: string): void {
        const itemsContainer = this.processEl?.querySelector('.process-items');
        if (!itemsContainer) return;
        
        const step = document.createElement('div');
        step.className = 'process-step';
        
        const stepText = document.createElement('span');
        stepText.textContent = `• ${new Date().toLocaleTimeString()}: ${message}`;
        step.appendChild(stepText);
        
        itemsContainer.appendChild(step);
        this.scrollToBottom();
    }

    public addFile(file: TFile): void {
        const itemsContainer = this.filesEl?.querySelector('.file-items');
        if (!itemsContainer) return;
        
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.path = file.path;
        
        const fileName = document.createElement('span');
        fileName.className = 'file-link';
        fileName.textContent = file.basename;
        
        fileName.onclick = () => this.openLocalGraph(file);
        fileItem.appendChild(fileName);
        itemsContainer.appendChild(fileItem);
        this.scrollToBottom();
    }

    private async openLocalGraph(file: TFile): Promise<void> {
        try {
            if (this.graphLeaf) {
                this.graphLeaf.detach();
            }

            this.graphLeaf = this.app.workspace.getRightLeaf(false);
            await this.graphLeaf?.setViewState({
                type: 'localgraph',
                state: { file: file.path }
            });
            
            this.addStep(`Opened local graph for: ${file.basename}`);
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            this.addStep(`Error opening graph: ${error}`);
        }
    }

    private scrollToBottom(): void {
        if (this.noticeEl) {
            this.noticeEl.scrollTop = this.noticeEl.scrollHeight;
        }
    }

    public close(): void {
        if (this.graphLeaf) {
            this.graphLeaf.detach();
        }
        this.noticeEl?.remove();
    }
}