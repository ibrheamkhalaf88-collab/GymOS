// Ambient declarations so `tsc --noEmit` can check the Edge Function in CI.
//
// The function runs on Deno and imports from npm: specifiers, neither of
// which the Node TypeScript compiler resolves. Stubbing them here means a
// syntax error or a bad property access fails the build instead of taking the
// whole API down at deploy time. Runtime types still come from Deno itself.

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module "npm:@supabase/supabase-js@2.45.4" {
  export const createClient: any;
}

declare module "npm:bcryptjs@2.4.3" {
  const bcrypt: any;
  export default bcrypt;
}

declare module "npm:jsonwebtoken" {
  const jwt: any;
  export default jwt;
}
