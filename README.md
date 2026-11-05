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

## CAD commands and quad surfaces

The command line sits below the viewport. Press `/` to focus it, Enter to execute, Up/Down to revisit commands, and Escape to cancel a guided operation. Type `Help` for examples.

- `Move` activates handles; `Move 10 0 0` moves selected objects by a millimeter offset.
- `Rotate` activates handles; `Rotate y 90` rotates around the selection center.
- `Scale` activates handles; `Scale 1.5` scales uniformly around the selection center.
- `Copy` or `Copy 10 0 0`, `Delete`, `Undo`, `Redo`, `Mirror`, `SelectAll`, `SelectPrevious`, `LastEdited`, `Fit`.
- `Align`: click the base object, the target object, then one of six tangent faces of the target's oriented volume bounds. The base's local +Y direction follows the chosen normal, and its lowest projected point contacts the plane. The target remains fixed. This aligns to a volume tangent plane; it does not wrap or deform geometry onto a curved surface.
- `ClippingPlane`: create a visible section plane. Use `MoveClippingPlane` and `RotateClippingPlane`, or Move/Rotate numerical commands while editing it.
- `EnableClippingPlane`, `DisableClippingPlane`, `FlipClippingPlane` control the view section.
- `ApplyClippingCut`: permanently trim selected closed solids (or the whole scene when nothing is selected), cap the cut, and disable the view section. Undo restores the originals. View clipping alone never changes export geometry.

Quad wireframe, OBJ and Rhino exports use conforming subdivision: each original triangle becomes three planar four-sided faces, with shared edge midpoints. Shape and boundaries are retained, but this is not uniform or curvature-aware retopology. GPU rendering and solid-repair kernels still use triangles internally. Clipping-plane placement and enable state are saved with the browser workspace.

## Feature library, section objects and rotation

The library uses four fixed categories: Appendages, Whole Figures, Accessories and Heads. Names containing recognizable part or accessory words receive an initial category; ambiguous names default to Whole Figures. Correct any assignment using the category selector on its card. Existing browser libraries are migrated without removing imports. Category assignments support Undo/Redo and browser saving.

Select the clipping plane by clicking an exposed part of it in the viewport or its Clipping plane entry in Scene objects. Standard Move/Rotate/Scale toolbar tools and W/E/R now control the selected plane; numeric property fields also apply to it. Scaling resizes its visual rectangle; clipping still extends infinitely. Click a model or press Escape to leave plane editing.

Closed meshes receive pink stencil section caps at the cut, so they read as solid massing from the section side. The cap is a view effect; ApplyClippingCut is still required to bake a closed cut into exports. Open or inconsistent input meshes may not display reliable winding-count caps until repaired.

Rotate selection offers world X/Y/Z axes, exact 45°, 90° and 180° buttons, reverse direction, and Free / 45° / 90° / 180° handle snapping. These controls apply to selected model parts or the clipping plane.

## Mesh-derived contact alignment and reference layout

Align now follows four steps: select the base object, select its tangent face, select a different target object, then select the target tangent face. The previous three-step workflow is superseded.

Tangent candidates combine area-weighted mesh normal clusters with axial and oblique support directions (typically 26–48 choices). Plane anchors are actual mesh vertices or points inside supporting triangles. The chosen base normal rotates opposite the chosen target normal, and the two contact anchors coincide; all source vertices participate in support calculations. This avoids the old gap from aligning to a bounding-box center. Tangent faces describe the overall volume, including edge/corner contact directions; Align does not deform a mesh to match another surface.

The interface uses the supplied reference's black background, cyan angular frames, large left perspective panel and right dock. The right dock includes a live orthographic XZ top view with pan, zoom, fit and object selection. Figures and Properties tabs expose the full existing toolset. The command line stays below the main viewport. Face choices and the current Align prompt appear directly above the main viewport.
