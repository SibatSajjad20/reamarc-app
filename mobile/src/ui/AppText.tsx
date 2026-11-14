import React from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { appTypeStyle } from '../theme/typography';

export const Text = React.forwardRef<RNText, TextProps>(function AppText(
  { style, allowFontScaling = true, ...rest },
  ref,
) {
  return (
    <RNText ref={ref} allowFontScaling={allowFontScaling} {...rest} style={appTypeStyle(style) as TextProps['style']} />
  );
});

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function AppTextInput(
  { style, allowFontScaling = true, ...rest },
  ref,
) {
  return (
    <RNTextInput
      ref={ref}
      allowFontScaling={allowFontScaling}
      {...rest}
      style={appTypeStyle(style) as TextInputProps['style']}
    />
  );
});
