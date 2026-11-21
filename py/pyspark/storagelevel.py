class StorageLevel:
    def __init__(self, useDisk, useMemory, useOffHeap, deserialized, replication=1):
        self.useDisk, self.useMemory, self.useOffHeap = useDisk, useMemory, useOffHeap
        self.deserialized, self.replication = deserialized, replication

    def __repr__(self):
        return f"StorageLevel({self.useDisk}, {self.useMemory}, {self.useOffHeap}, {self.deserialized}, {self.replication})"


StorageLevel.DISK_ONLY = StorageLevel(True, False, False, False)
StorageLevel.MEMORY_ONLY = StorageLevel(False, True, False, False)
StorageLevel.MEMORY_AND_DISK = StorageLevel(True, True, False, False)
StorageLevel.MEMORY_AND_DISK_DESER = StorageLevel(True, True, False, True)
