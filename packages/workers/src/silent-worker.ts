// fixture: loads fine, never calls register() — nothing keeps the thread alive, so it
// exits with code 0 and the pool must treat that as a startup failure, not hang forever.
export {};
