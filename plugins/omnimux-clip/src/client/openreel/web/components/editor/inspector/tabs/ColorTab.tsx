import React from "react";
import { ColorGradingSection } from "../";
import { InspectorSection } from "../shell/InspectorSection";
import { useClipT } from "../../../../../../i18n/index.js";

export interface ColorTabProps {
  clipId: string;
  showColorGrading: boolean;
}

export const ColorTab: React.FC<ColorTabProps> = ({
  clipId,
  showColorGrading,
}) => {
  const t = useClipT();
  return (
    <>
      {showColorGrading && (
        <>
          <InspectorSection
            title={t("Color Grading")}
            sectionId="color-grading"
            defaultOpen={false}
          >
            <ColorGradingSection clipId={clipId} />
          </InspectorSection>
        </>
      )}
    </>
  );
};
