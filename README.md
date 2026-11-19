# Oro: the room

An interactive 3D bedroom in Cape Town at dusk, built around one Oro beanbag. Scroll through four camera chapters, tap the beanbag to change its design, sit on it, or render it in 4K.

Built with Next.js, Three.js (with a film-grade post-processing pass), GSAP and React Bits. Pre-launch concept: designs, sizes and prices to be confirmed.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Where things live

- `src/components/room/RoomApp.tsx`: the page, scroll chapters (`CHAPTERS`) and customise panel
- `src/components/room/engine.js`: the 3D room, camera shots (`SHOTS`) and film grade
- `src/components/shared/kits.ts`: football legends and their kit colours
