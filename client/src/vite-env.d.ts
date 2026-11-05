/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' builds the 3D office into the app (`VITE_OFFICE_3D=1 npm run build`); unset, the app is the 2D dashboard only. */
  readonly VITE_OFFICE_3D?: string;
}
