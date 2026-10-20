# Character credits

All character assets are by **Quaternius** and released under **CC0** (public domain).

| Used as | Pack | Link |
| :--- | :--- | :--- |
| Male + female bodies, eyes, eyebrows, 5 hairstyles | Universal Base Characters [Standard] | https://quaternius.itch.io/universal-base-characters |
| 16 animations (retargeted onto every character) | Universal Animation Library [Standard] | https://quaternius.com/packs/universalanimationlibrary.html (download: https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip) |
| 16 ready-made characters (`mod-*.glb`; military, weapon and punk outfits left out) | Ultimate Modular Men Pack, Ultimate Modular Women Pack | https://quaternius.com |

Built by `tools/world/fetch-characters.mjs`: animations retargeted bone by bone, mesh lightly simplified,
skin texture 1024 px (stubble removed), normal map 512 px, hair textures 256 px.
Clothes and skin tone are painted at runtime by `character.js`. The modular characters keep their own outfits;
their colours are baked into the vertices, with marker colours for skin and hair so the player can recolour them.
