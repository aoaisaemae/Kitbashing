# FORM — Kitbashing Studio

A browser-based 3D workspace for importing OBJ parts, arranging compositions, repairing meshes, and exporting OBJ or native Rhino `.3dm` files.

[Open the hosted studio](https://form-obj-studio.isalictaoa18.chatgpt.site)

## Run locally

Install Node.js 18 or newer, then run:

```sh
git clone https://github.com/aoaisaemae/Kitbashing.git
cd Kitbashing
npm start
```

Open http://127.0.0.1:8080. No dependency installation or build step is required. Alternatively, run `python -m http.server 8080` in the repository root.

Serve this project over HTTP; opening `index.html` directly does not support the module workers and WebAssembly loaders.

## Features

- Import OBJ files; disconnected components become independently editable parts.
- Organize imports in folders; remove individual library items or clear the collection.
- Move, rotate, scale, duplicate, copy and paste objects.
- Add all imports in a grid, clear the placed scene without clearing the library, and recall the previous selection or last edited objects.
- Shift-click and box-select multiple pieces; Ctrl/Cmd-click removes items from a selection.
- Undo and redo scene and library changes.
- Fuse overlapping closed solids with triangular surface preservation.
- Scan openings, non-manifold edges, intersections, and sampled thin-area and overhang risks.
- Repair seams, face directions, duplicate faces and holes; reconstruct difficult meshes with adaptive resolution.
- Export all scene pieces as OBJ or separate named, colored Rhino meshes in a millimeter `.3dm` document.
- Save the scene, library, folders, transforms and camera in browser-local IndexedDB.

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Move / rotate / scale | W / E / R, or MO / RO / SC |
| Uniform scaling | Hold Shift while dragging a scale axis |
| Undo | Ctrl/Cmd + Z |
| Redo | Ctrl/Cmd + Shift + Z; Ctrl + Y |
| Copy / paste | Ctrl/Cmd + C / V |
| Duplicate | Ctrl/Cmd + D |
| Mirror selection | MI (choose axis and plane in Properties) |
| Drag a copy | Hold Alt while dragging an object or a Move handle |
| Remove selection | Delete / Backspace |
| Frame selection / fit scene | F / A |
| Deselect | Escape |
| Toggle local/world axes | X |

Drag empty viewport space to box-select; use Shift to add and Ctrl/Cmd to subtract.

## Files

- `index.html`, `style.css`, `app.js`: interface and workspace behavior.
- `geometry.js`: disconnected-part detection.
- `fusion-worker.js`: exact solid union.
- `repair-core.js`, `repair-worker.js`: diagnostics, cleanup and triangular reconstruction.
- Bundled Three.js, three-mesh-bvh, Manifold and rhino3dm JavaScript/WebAssembly files and their license notices.

Run `npm run check` for JavaScript syntax checks.

## Storage and printing notes

Imported user models and saved browser workspaces are not included in this repository. Saved work belongs to the browser profile and site origin: localhost, GitHub Pages and the hosted studio have separate storage. Clearing site data removes that browser's saved workspace. Export models before switching browsers or hosting locations.

The workspace treats one coordinate unit as one millimeter. OBJ carries no unit metadata; confirm millimeters in your slicer. Rhino export records millimeter units and converts Y-up to Rhino Z-up while retaining relative placement.

Reconstruction may change dimensions, round detail, thicken surfaces or fill intentional openings. Review the repair report and use Undo to compare with the originals. Thin-area and overhang checks are sampled estimates; review supports, scale, wall thickness, bed adhesion and printer settings in a slicer.

## Hosting

All website files are in the repository root and can be served by any static host with JavaScript module and WebAssembly support. Repository publication does not enable GitHub Pages or replace the existing hosted studio.

Third-party libraries retain their included license notices.
