export interface ViewState {
  preserve: boolean;
}

export function defaultViewState(): ViewState {
  return { preserve: true };
}
