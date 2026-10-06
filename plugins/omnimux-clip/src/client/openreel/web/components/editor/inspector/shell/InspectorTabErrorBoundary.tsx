import * as React from "react";
import { useClipT } from "../../../../../../i18n/index.js";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

interface ViewProps extends Props {
  t: (src: string) => string;
}

class InspectorTabErrorBoundaryView extends React.Component<ViewProps, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center text-xs text-fg-2">
          {this.props.t("This panel hit an error. Switch tabs and back to retry.")}
        </div>
      );
    }
    return this.props.children;
  }
}

export function InspectorTabErrorBoundary({ children }: Props): React.ReactNode {
  const t = useClipT();
  return (
    <InspectorTabErrorBoundaryView t={t}>{children}</InspectorTabErrorBoundaryView>
  );
}
