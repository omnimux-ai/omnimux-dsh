import React from "react";
import { TextSection, ShapeSection, SVGSection } from "../";
import { InspectorSection } from "../shell/InspectorSection";
import { useClipT } from "../../../../../../i18n/index.js";

export interface StyleTabProps {
  clipId: string;
  showTextSection: boolean;
  showShapeSection: boolean;
  showSVGSection: boolean;
}

export const StyleTab: React.FC<StyleTabProps> = ({
  clipId,
  showTextSection,
  showShapeSection,
  showSVGSection,
}) => {
  const t = useClipT();
  return (
    <>
      {showTextSection && (
        <InspectorSection title={t("Text Properties")} sectionId="text-properties">
          <TextSection clipId={clipId} />
        </InspectorSection>
      )}
      {showShapeSection && (
        <InspectorSection title={t("Shape Properties")} sectionId="shape-properties">
          <ShapeSection clipId={clipId} />
        </InspectorSection>
      )}
      {showSVGSection && (
        <InspectorSection title={t("SVG Properties")}>
          <SVGSection clipId={clipId} />
        </InspectorSection>
      )}
    </>
  );
};
