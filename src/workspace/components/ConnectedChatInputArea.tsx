import { ChatInputArea, type ChatInputAreaProps } from './ChatInputArea';
import { useChatUIStore } from '../store/chatUIStore';

type ConnectedChatInputAreaProps = Omit<
  ChatInputAreaProps,
  'input' | 'setInput'
>;

export function ConnectedChatInputArea(
  props: ConnectedChatInputAreaProps
) {
  const input = useChatUIStore((state) => state.input);
  const setInput = useChatUIStore((state) => state.setInput);

  return <ChatInputArea {...props} input={input} setInput={setInput} />;
}
