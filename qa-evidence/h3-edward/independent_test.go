package qa_test

import (
 "bytes"
 "encoding/json"
 "io"
 "net/http/httptest"
 "strings"
 "testing"

 "github.com/QuantumNous/new-api/model"
 "github.com/QuantumNous/new-api/relay/channel/task/fal"
 rc "github.com/QuantumNous/new-api/relay/common"
 "github.com/gin-gonic/gin"
)

func submit(t *testing.T, raw map[string]any) (map[string]any, bool) {
 t.Helper()
 b, _ := json.Marshal(raw)
 c, _ := gin.CreateTestContext(httptest.NewRecorder())
 c.Request = httptest.NewRequest("POST", "/v1/video/generations", bytes.NewReader(b))
 c.Request.Header.Set("Content-Type", "application/json")
 info := &rc.RelayInfo{OriginModelName: raw["model"].(string), ChannelMeta: &rc.ChannelMeta{ChannelBaseUrl: "http://127.0.0.1:1"}}
 a := &fal.TaskAdaptor{}
 a.Init(info)
 if e := a.ValidateRequestAndSetAction(c, info); e != nil { return nil, false }
 r, e := a.BuildRequestBody(c, info)
 if e != nil { return nil, false }
 data, e := io.ReadAll(r); if e != nil { t.Fatal(e) }
 var out map[string]any
 if e = json.Unmarshal(data, &out); e != nil { t.Fatal(e) }
 return out, true
}

func TestIndependentArtifacts(t *testing.T) {
 for _, tc := range []struct{name, body, want string}{
  {"bare completed", `{"status":"COMPLETED"}`, model.TaskStatusInProgress},
  {"malformed https artifact", `{"status":"COMPLETED","video":{"url":"https://"}}`, model.TaskStatusInProgress},
  {"failed stale artifact", `{"status":"FAILED","video":{"url":"https://example.invalid/stale.mp4"}}`, model.TaskStatusFailure},
  {"cancelled stale artifact", `{"status":"CANCELLED","video":{"url":"https://example.invalid/stale.mp4"}}`, model.TaskStatusFailure},
  {"array detail", `{"detail":[{"loc":["body",0],"msg":"invalid","type":"value_error"}]}`, model.TaskStatusFailure},
  {"valid artifact", `{"video":{"url":"https://example.invalid/out.mp4"}}`, model.TaskStatusSuccess},
 } { t.Run(tc.name,func(t *testing.T){
  result,err:=(&fal.TaskAdaptor{}).ParseTaskResult([]byte(tc.body)); if err!=nil {t.Fatal(err)}
  if result.Status!=tc.want {t.Errorf("expected %s got %s url=%q",tc.want,result.Status,result.Url)}
 }) }
}

func TestIndependentPayloads(t *testing.T) {
 gin.SetMode(gin.TestMode)
 for _,res:=range []string{"720p","720","720P"," 720p "} {t.Run("reject legacy "+res,func(t *testing.T){
  _,ok:=submit(t,map[string]any{"model":"minimax/h3-max","operation":"text_to_video","prompt":"test","resolution":res})
  if ok {t.Error("legacy 720 resolution silently accepted")}
 })}
 for _,n:=range []int{7001,50000,50001} {t.Run("prompt "+strings.Repeat("x",n%10+1),func(t *testing.T){
  _,ok:=submit(t,map[string]any{"model":"minimax/h3-max","prompt":strings.Repeat("字",n),"resolution":"768p"})
  if ok!=(n<=50000) {t.Errorf("length %d accepted=%v",n,ok)}
 })}
 t.Run("three reference arrays ordered",func(t *testing.T){
  raw:=map[string]any{"model":"minimax/h3-max","operation":"video_multi_ref","prompt":"test","resolution":"768p",
   "image_urls":[]string{"https://example.invalid/i2.png","https://example.invalid/i1.png"},
   "video_urls":[]string{"https://example.invalid/v2.mp4","https://example.invalid/v1.mp4"},
   "audio_urls":[]string{"https://example.invalid/a2.mp3","https://example.invalid/a1.mp3"}}
  out,ok:=submit(t,raw); if !ok {t.Fatal("rejected valid media")}
  for _,kind:=range []string{"image","video","audio"} {a,_:=json.Marshal(raw[kind+"_urls"]);b,_:=json.Marshal(out["reference_"+kind+"_urls"]);if !bytes.Equal(a,b){t.Errorf("%s array changed",kind)}}
  if out["image_url"]!=nil||out["video_url"]!=nil {t.Error("singular fields leaked")}
 })
 for _,n:=range []int{9,10} {t.Run("image count "+string(rune('0'+n)),func(t *testing.T){
  images:=make([]string,n);for i:=range images {images[i]="https://example.invalid/i.png"}
  _,ok:=submit(t,map[string]any{"model":"minimax/h3-max","operation":"video_multi_ref","prompt":"test","image_urls":images})
  if ok!=(n==9){t.Errorf("images %d accepted=%v",n,ok)}
 })}
}
