export function getGeolocationErrorMessage(error: Pick<GeolocationPositionError, 'code'>): string {
  switch (error.code) {
    case 1:
      return '位置情報の利用が拒否されました。ブラウザーの権限設定を確認してください。';
    case 2:
      return '現在位置を取得できませんでした。電波状況を確認してください。';
    case 3:
      return '現在位置の取得がタイムアウトしました。';
    default:
      return '現在位置の取得中にエラーが発生しました。';
  }
}

