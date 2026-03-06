package com.voiceactivator.Runtime

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

internal class RuntimeStateStore(initialStatus: Map<String, Any?>) {
  private var status: Map<String, Any?> = initialStatus.toMap()

  fun currentStatus(): WritableMap = status.toWritableMap()

  fun updateStatus(nextStatus: Map<String, Any?>) {
    status = nextStatus.toMap()
  }

  private fun Map<String, Any?>.toWritableMap(): WritableMap =
    Arguments.createMap().apply {
      for ((key, value) in this@toWritableMap) {
        putAny(key, value)
      }
    }

  private fun WritableMap.putAny(key: String, value: Any?) {
    when (value) {
      null -> putNull(key)
      is String -> putString(key, value)
      is Boolean -> putBoolean(key, value)
      is Int -> putInt(key, value)
      is Double -> putDouble(key, value)
      is Float -> putDouble(key, value.toDouble())
      is Map<*, *> -> {
        @Suppress("UNCHECKED_CAST")
        putMap(key, (value as Map<String, Any?>).toWritableMap())
      }
      else -> putString(key, value.toString())
    }
  }
}
