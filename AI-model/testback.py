from smart_health_dog_disease_detection import predict_dog_disease

result = predict_dog_disease.delay(
    "http://10.177.27.202:8000/dog1.jpg",
    "test-id"
)

print(result.get(timeout=30))