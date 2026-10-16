export type RestPushOptions = { uid: string | null; deadline: number | null };
export type RestPushController = {
  enabled: boolean;
  busy: boolean;
  status: string;
  toggle: () => Promise<void>;
};
