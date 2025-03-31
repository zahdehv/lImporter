```
corner-down-left -> enter
chevron-left
chevron-right
play
mic
mic-off
trash
cross
check
send-horizonal
timer-reset
list-restart
network
minimize
bot-message-square
experiment
```

```ts
// 2. Create a new instance of EnhancedDiffModal, passing props
            const diffModal = new EnhancedDiffModal({
                app: this.app, // Pass the app instance (assuming 'this.app' is available in BaseBottomBarView)
                oldVersion: exampleOldVersion, // Pass example old version
                newVersion: exampleNewVersion, // Pass example new version
                action: exampleAction,       // Pass example action
                filepath: exampleFilepath,   // Pass example filepath
                onConfirm: (confirmed) => {   // Define the onConfirm callback
                    if (confirmed) {
                        new Notice("Diff Confirmed! (Action to proceed would go here)");
                        console.log("Diff Confirmed by user for file:", exampleFilepath);
                        // --- Your code to perform the action (e.g., writeFile, etc.) would go here ---
                        // You would likely use 'exampleNewVersion' and 'exampleFilepath' in your action
                    } else {
                        new Notice("Diff Cancelled!");
                        console.log("Diff Cancelled by user for file:", exampleFilepath);
                        // --- Code to handle cancellation would go here (if needed) ---
                    }
                },
            });

            // 3. Open the EnhancedDiffModal
            diffModal.open();
```

- add test modal bujajajajaja

1. ¿A quién está dirigida la poesía? (Por ejemplo, a tu pareja, a un amor platónico, a alguien especial, etc. Respuesta por defecto: 'A un ser amado')
2. ¿Cuál es el tono general que deseas para la poesía? (Por ejemplo, romántico, apasionado, melancólico, alegre, etc. Respuesta por defecto: 'Romántico')
3. ¿Hay algún tema o imagen específica que quieras que se incluya en la poesía? (Por ejemplo, la naturaleza, un recuerdo especial, una promesa, etc. Respuesta por defecto: 'El amor eterno')
4. ¿Hay alguna palabra o frase clave que te gustaría que se repita o destaque en la poesía? (Respuesta por defecto: 'Mi amor')
5. ¿Qué extensión te gustaría que tuviera la poesía? (Corta, media, larga. Respuesta por defecto: 'Media')