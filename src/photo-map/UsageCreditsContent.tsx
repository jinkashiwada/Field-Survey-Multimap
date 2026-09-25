import { TOOL_CREDIT_LINE, TOOL_URL } from './usageCredit';

export function UsageCreditsContent() {
  return <>
    <h2>本ツール利用時のクレジット表示について</h2>
    <p>公開ページは自由に利用・共有できます。成果物への本ツールのクレジット表記は必須ではありません。不都合がなければ、次の2行をご記載ください。</p>
    <div className="pm-credit-example">
      <span>{TOOL_CREDIT_LINE}</span>
      <a href={TOOL_URL} target="_blank" rel="noopener noreferrer">{TOOL_URL}</a>
    </div>
    <p>地図・航空写真・浸水想定区域などの出典表示と加工表示は、本ツールのクレジットとは別に、各データ提供元の利用条件に従ってください。元写真・持込みGISの公開条件も持込み元で確認してください。</p>
    <p>作業ZIPには元画像とEXIFなどのメタデータが含まれます。共有前に内容をご確認ください。ソースコードの複製・改変・再配布についてはライセンス未決定のため、別途ご相談ください。</p>
  </>;
}
