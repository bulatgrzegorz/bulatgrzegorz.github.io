// Appends resize + auto format/quality after any existing transforms (e.g. t_To43),
// so originals are never served at full size. Non-Cloudinary URLs pass through.
export const cloudinary = (url: string | undefined, width: number) =>
  url?.replace(
    /\/image\/upload\/((?:[a-z]+_[^/]*\/)*)/,
    (_, transforms) =>
      `/image/upload/${transforms}f_auto,q_auto,c_limit,w_${width}/`
  );
