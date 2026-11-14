import React from 'react';
import { OneWorkLaneLogo, type OneWorkLaneLogoProps } from './OneWorkLaneLogo';

export type ReamarcLogo3DProps = OneWorkLaneLogoProps;

export const ReamarcLogo3D: React.FC<ReamarcLogo3DProps> = (props) => {
  return <OneWorkLaneLogo {...props} />;
};

export default ReamarcLogo3D;
