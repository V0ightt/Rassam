// Kept free of React so the root layout (a server component) can import it.

export const THEME_STORAGE_KEY = "rassam_theme";
export const SOLID_STORAGE_KEY = "rassam_solid_surfaces";

/**
 * The storage keys are written out literally (they must match the constants
 * above) so no value is ever interpolated into script text.
 *
 * Runs before hydration. First visit follows `prefers-color-scheme`; dark is the default. */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem("rassam_theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}d.setAttribute("data-theme",t);if(localStorage.getItem("rassam_solid_surfaces")==="true"){d.setAttribute("data-solid","true")}}catch(e){}})();`;
