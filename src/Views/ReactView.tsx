import React, { useRef, useEffect } from 'react'; // Import useRef and useEffect
import * as Diff from 'diff';
import * as Diff2Html from 'diff2html';
import { Diff2HtmlUI } from 'diff2html/lib/ui/js/diff2html-ui-slim'; // Import Diff2HtmlUI
import { ColorSchemeType } from 'diff2html/lib/types';

// --- Type Overrides --- (Keep these for diff2html config)
interface CustomDiff2HtmlConfig extends Diff2Html.Diff2HtmlConfig {
    outputFormat: any;
    highlight?: boolean;
    fileContentToggle: boolean;
}
// --- End Type Overrides ---

interface ReactViewProps {
    oldVersion: string;
    newVersion: string;
    action: 'create' | 'change' | 'delete';
    filepath: string;
}

export const ReactView: React.FC<ReactViewProps> = (props) => {
    const { oldVersion, newVersion, action, filepath } = props;
    const diffContainerRef = useRef<HTMLDivElement>(null); // Create a ref for the div

    useEffect(() => {
        if (!diffContainerRef.current) return; // Ensure ref is attached

        // 1. Generate diff using jsdiff (line diff) - same as before
        // const diff = Diff.diffWords("", newVersion);

        // 2. Convert jsdiff output to unified diff format - same as before
        let unifiedDiff = '';
    if (action === 'create') {
        unifiedDiff =  Diff.createPatch(filepath, '', newVersion).replace('--- '+filepath+'', 'diff --git a/'+filepath+' b/'+filepath+'\nnew file mode 100000 \n--- '+filepath+''); 
        // unifiedDiff = Diff.createTwoFilesPatch('/dev/null', filepath, '', newVersion, '/dev/null', filepath);
    } else if (action === 'delete') {
        unifiedDiff =  Diff.createPatch(filepath, oldVersion, '').replace('--- '+filepath+'', 'diff --git a/'+filepath+' b/'+filepath+'\ndeleted file mode 100000 \n--- '+filepath+''); 
    }
    else { // 'change' action
        unifiedDiff =  Diff.createPatch(filepath, oldVersion, newVersion)
    }
        console.log(unifiedDiff);
//         unifiedDiff = `Index: example-note.md
// ===================================================================
// --- example-note.md	
// +++ example-note.md	CREATED
// @@ -1,3 +1,4 @@
// +This is the modified content.
//  This is the original content.
// -Line 2 of the original.
// -Line 3 of the original.
// \\ No newline at end of file
// +Line 2 is changed in the new version.
// +Line 3, and a new line 4 is added.
// \\ No newline at end of file`

        // 3. Create Diff2HtmlUI instance and draw
        const diff2htmlConfig: CustomDiff2HtmlConfig = {
            outputFormat: 'line-by-line',
            colorScheme: ColorSchemeType.DARK,
            drawFileList: false,
            highlight: true,
            fileContentToggle: false,
            diffStyle: 'word'
            // synchronisedScroll: true, // Enable synchronized scroll
            // fileListToggle: false,    // Disable file list toggle (not needed in modal)
            // stickyFileHeaders: true,   // Make file headers sticky
        };

        if (diffContainerRef.current) { // Check again if ref is still valid
            const diff2htmlUi = new Diff2HtmlUI(diffContainerRef.current, unifiedDiff, diff2htmlConfig);
            diff2htmlUi.draw();
            diff2htmlUi.highlightCode(); // Enable syntax highlighting
            // diff2htmlUi.synchronisedScroll(); // Enable synchronized scroll (redundant here as it's in config, but good to show)
        }

    }, [oldVersion, newVersion, action, filepath]); // Dependency array for useEffect (re-run effect when these props change

    // 4. Render a div that will be the target for Diff2HtmlUI
    return (
        <div style={{ height: '100%', overflow: 'auto' }} ref={diffContainerRef}>
            {/* Diff2HtmlUI will inject HTML here */}
        </div>
    );
};