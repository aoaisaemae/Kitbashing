# POPMARKIT — Kitbashing Studio

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
- `Align`: select the base object, its tangent face, a target object, then a target tangent face. Mesh-derived candidates include axial, oblique and area-weighted surface directions. The chosen contact faces touch; the target stays fixed. This operation does not deform geometry to wrap around a curved surface.
- `ClippingPlane`: create a visible section plane. Use `MoveClippingPlane` and `RotateClippingPlane`, or Move/Rotate numerical commands while editing it.
- `EnableClippingPlane`, `DisableClippingPlane`, `FlipClippingPlane` control the view section.
- `ApplyClippingCut`: permanently trim selected closed solids (or the whole scene when nothing is selected), cap the cut, and disable the view section. Undo restores the originals. View clipping alone never changes export geometry.

Quad wireframe, OBJ and Rhino exports use conforming subdivision: each original triangle becomes three planar four-sided faces, with shared edge midpoints. Shape and boundaries are retained, but this is not uniform or curvature-aware retopology. GPU rendering and solid-repair kernels still use triangles internally. Clipping-plane placement and enable state are saved with the browser workspace.

## Feature library, section objects and rotation

The library uses five fixed categories: Appendages, Whole Figures, Body, Accessories and Heads. Torso/chest filenames and close matches to categorized Body references are sorted into Body. Names containing recognizable part or accessory words receive an initial category; ambiguous names default to Whole Figures. Correct any assignment using the category selector on its card. Existing browser libraries are migrated without removing imports. Category assignments support Undo/Redo and browser saving.

Select the clipping plane by clicking an exposed part of it in the viewport or its Clipping plane entry in Scene objects. Standard Move/Rotate/Scale toolbar tools and W/E/R now control the selected plane; numeric property fields also apply to it. Scaling resizes its visual rectangle; clipping still extends infinitely. Click a model or press Escape to leave plane editing.

Closed meshes receive pink stencil section caps at the cut, so they read as solid massing from the section side. The cap is a view effect; ApplyClippingCut is still required to bake a closed cut into exports. Open or inconsistent input meshes may not display reliable winding-count caps until repaired.

Rotate selection offers world X/Y/Z axes, exact 45°, 90° and 180° buttons, reverse direction, and Free / 45° / 90° / 180° handle snapping. These controls apply to selected model parts or the clipping plane.

## Mesh-derived contact alignment and reference layout

Align now follows four steps: select the base object, select its tangent face, select a different target object, then select the target tangent face. The previous three-step workflow is superseded.

Tangent candidates combine area-weighted mesh normal clusters with axial and oblique support directions (typically 26–48 choices). Plane anchors are actual mesh vertices or points inside supporting triangles. The chosen base normal rotates opposite the chosen target normal, and the two contact anchors coincide; all source vertices participate in support calculations. This avoids the old gap from aligning to a bounding-box center. Tangent faces describe the overall volume, including edge/corner contact directions; Align does not deform a mesh to match another surface.

The interface uses the supplied reference's black background, cyan angular frames, large left perspective panel and right dock. The right dock includes a live orthographic XZ top view with pan, zoom, fit and object selection. Figures, Properties and Layers tabs expose the toolset. The command line stays below the main viewport. Face choices and the current Align prompt appear directly above the main viewport.

## Split figures into closed quad parts

Use the viewport **Split** button or enter `Split`, `Split 1` or `Split 2` in the command line. Select the figure first, or click it in the main viewport when prompted. Several selected solids can be processed as one figure.

- Level 1 separates Head and Body.
- Level 2 additionally separates left/right arms, left/right legs, and accessories. Disconnected output volumes remain independently editable.
- The initial proposal uses height profiles plus categorized head, body and limb proportions. Disconnected accessories can be matched to categorized library examples; an adjustable accessory box handles attached hats, bows or jewelry. This is a geometric estimate, not a semantic recognition guarantee. Review unusual, crouched or overlapping figures carefully.
- Choose Local X/Y/Z as the figure up direction. Select a guide, drag its viewport handle or change its percentage, then choose Preview closed parts. An accessory region supports moving, rotating and scaling. Quad wire view also works on the preview.
- Preview does not replace source objects. Applying checks source stability, closed edge topology and partition volume, then puts the results into category sublayers. A single Undo restores the originals. Escape or Cancel stops a running preview.
- Automatic repair can close source openings. Difficult invalid sources may need surface reconstruction, which can alter small details or dimensions; this is reported before Apply. Disable automatic repair to require surface-preserving closure. The established conforming quad export produces four-sided faces on each closed result; rendering and boolean kernels use triangles internally. Closed topology alone does not guarantee printable wall thickness or support-free geometry; use the existing print checks and slicer preview.

## Layers and property groups

The Layers tab lists every workspace object and the clipping-plane helper. Add top-level layers or sublayers, rename/reparent them, and assign objects through each row's layer menu. Lock/unlock uses 🔒 / 🔓; show/hide uses 👁️ / 🙈. Parent locks and visibility apply to descendants. Protected objects are excluded from picking, transforms, fusion, repair, splitting and Clear workspace. Layer changes support Undo/Redo and browser persistence. Rhino exports include the native layer hierarchy; hidden objects stay in the Rhino file, while OBJ export includes shown geometry.

Properties is organized into collapsible Workspace, Transform, Fusion and Clipping Plane groups. Workspace contains add-all, clear, grid arrangement and selection recall. Transform contains position, rotation, exact rotation choices, scale and mirror. Fusion contains density, Fuse, and nested print/repair controls. Clipping Plane contains enable, disable, move, rotate and Apply cut. Existing browser workspace records migrate additively under the same storage key.

## Figures / Project / Resolution viewport tabs

The top viewport tabs share the same perspective view, plan view, control dock, transforms, command line, and clipping tools. Content is kept separate by stage. Legacy saved items default to Figures under the existing browser storage key.

- **Figures** retains the source arrangement. Build Project combines all shown Figures, including locked reference pieces, without modifying those sources.
- **Project** holds one closed combined mesh. Intersecting solids are fused; disjoint enclosed shells remain together in the same mesh. Existing cleanup/capping and solid union run first, with automatic reconstruction for invalid surfaces when needed. Reconstructed results are identified in the status message because fine details and dimensions may change. Use Update Project from Figures to bring later source edits across. Locked Project results cannot be overwritten.
- **Resolution** starts from a separate Project copy. The slider and number field request between 100 quads and the original Project face count. Apply density runs topology-preserving meshoptimizer simplification in a browser worker, creates conforming four-sided patches, and validates closure, winding and enclosed volume before replacing geometry. Counts are even; difficult topology or many disconnected shells may impose a higher minimum, which is reported using the actual quad count. Inputs already below 100 keep their original face count. Original restores the stored full-detail geometry exactly; Update from Project replaces the study with the latest Project copy.

Lower face counts simplify the form. Quad patches may be nonplanar, and this is a density tool rather than semantic or uniform retopology. All rendered triangles, quad wire edges, OBJ faces and Rhino faces refer to the same four-corner patches at reduced densities. Original-detail exports retain the established conforming subdivision. Clipping can be moved/rotated, enabled/disabled, or baked with Apply cut in Resolution. Quad OBJ and Rhino exports include the active stage; other stages are kept in the browser workspace. Undo/Redo and browser persistence retain stage content, original resolution buffers, quad layouts and the active tab.

The bundled meshoptimizer v0.22 JavaScript simplifier is MIT-licensed; see meshoptimizer-LICENSE.txt. No external geometry service or runtime CDN is used.
