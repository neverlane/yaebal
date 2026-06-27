import { redirect } from "@sveltejs/kit";
const load = () => {
  redirect(307, "/docs/getting-started/");
};
export {
  load
};
