// Phase 60: licence text shown behind the Credits link on /atlas (from the prototype's own credits string, docs/HOLO_ATLAS.md "Licences").
// English on purpose: it is licence wording, not interface text. The CC BY-SA vs CC BY 4.0 note stays visible until the owner confirms it.
export const ATLAS_CREDITS: readonly string[] = [
  'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. License: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html. Terms: https://creativecommons.org/licenses/by/4.0/',
  'Source geometry: BodyParts3D 4.0 (isa_BP3D_4.0_obj_99), adult male reference anatomy. Citation: Mitsuhashi et al. (2009), BodyParts3D: 3D structure database for anatomical concepts. https://doi.org/10.1093/nar/gkn613',
  'Fitted models: Latissimus dorsi, Rectus abdominis, Internal oblique, Transversus abdominis and Multifidus are not in BodyParts3D. They were generated procedurally and fitted to the BodyParts3D trunk surfaces. They are approximations, not BodyParts3D data.',
  'Adaptations: only skeletal-muscle meshes and the skin surface were selected from the human-atlas conversion, simplified and compressed.',
  'human-atlas, MIT License, Copyright (c) 2026 ashemag (https://github.com/ashemag/human-atlas).',
  'threejs-vanilla-holographic-material, MIT License, Copyright (c) 2023 Anderson Mancini (https://github.com/ektogamat/threejs-vanilla-holographic-material). The shader here is an original adaptation of its ideas (fresnel, scanlines, flicker, additive blend).',
  'three.js r147, MIT License.',
  'MuscleMap, MIT License (the 2D figure).',
  'Note: legacy OBJ comments in the source mention CC BY-SA 2.1 Japan; the human-atlas authors state the current official licence (CC BY 4.0) supersedes it. To be confirmed before commercial release.',
  'Educational information, not medical advice.',
];
