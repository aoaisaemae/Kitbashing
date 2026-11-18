# Saved-item controls

Use dist/saved-picker.js for saved-item and imported-item lists. Keep selection inside the dropdown rather than a separate Selection section. Support one item, modifier/Shift multi-selection, and Select all. Put an × beside every entry; clicking it deletes the selected set when that entry is selected. Shift-clicking × selects the range and deletes it. Provide Insert for the selected set. Deleting library entries must leave placed workspace objects and external source files intact.

# Workspace organization

Use collapsible property-group sections with uppercase titles for workspace control panels. Spaces uses ASSIGN (BASE, ANCHOR), ASSEMBLE (FLOOR, ITERATE, PICK, SAVE), OPERATE (SET UP: INSERT, COPY), and SITE. Keep Spaces geometry and saved state separate from Iterations while reusing the iteration engine with its workspaceStage argument.
