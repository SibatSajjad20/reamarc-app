import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { htmlToPlainText, parseTaskHtml, type HtmlInline } from '../lib/taskHtml';

function InlineRun({
  inlines,
  style,
  numberOfLines,
}: {
  inlines: HtmlInline[];
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {inlines.map((part, idx) => (
        <Text
          key={`${idx}-${part.text.slice(0, 12)}`}
          style={part.bold ? styles.bold : styles.regular}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

export function TaskHtmlText({
  html,
  style,
  numberOfLines,
}: {
  html?: string | null;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const source = String(html || '');
  if (numberOfLines) {
    const plain = htmlToPlainText(source) || 'Untitled task';
    return (
      <Text style={[styles.regular, style]} numberOfLines={numberOfLines}>
        {plain}
      </Text>
    );
  }

  const blocks = parseTaskHtml(source);
  if (!blocks.length) {
    const plain = htmlToPlainText(source);
    if (!plain) return null;
    return <Text style={[styles.regular, style]}>{plain}</Text>;
  }

  return (
    <View style={styles.wrap}>
      {blocks.map((block, idx) => {
        if (block.type === 'li') {
          return (
            <View key={`li-${idx}`} style={styles.liRow}>
              <Text style={[styles.regular, styles.marker, style]}>
                {block.ordered ? `${block.index}.` : '•'}
              </Text>
              <View style={styles.liBody}>
                <InlineRun inlines={block.inlines} style={style} />
              </View>
            </View>
          );
        }
        return <InlineRun key={`p-${idx}`} inlines={block.inlines} style={style} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  regular: { fontWeight: '400' },
  bold: { fontWeight: '600' },
  liRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  marker: { width: 18, marginTop: 1 },
  liBody: { flex: 1, minWidth: 0 },
});
