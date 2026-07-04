{{- define "pasha-app.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end }}

{{- define "pasha-app.selectorLabels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
